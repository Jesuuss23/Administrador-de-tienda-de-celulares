package com.celucanje.tradein.service;

import com.celucanje.ai.dto.VisualAnalysisDtos.Result;
import com.celucanje.ai.service.GeminiVisualAnalysisClient;
import com.celucanje.tradein.service.TradeInVisualEvidenceService.Evidence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class TradeInVisualAnalysisService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TradeInVisualEvidenceService evidenceService;
    private final GeminiVisualAnalysisClient gemini;
    private final TransactionTemplate transaction;
    private final String model;

    public TradeInVisualAnalysisService(
            JdbcTemplate jdbc,
            ObjectMapper mapper,
            TradeInVisualEvidenceService evidenceService,
            GeminiVisualAnalysisClient gemini,
            PlatformTransactionManager transactionManager,
            @Value("${app.ai.gemini.model:}") String model
    ) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.evidenceService = evidenceService;
        this.gemini = gemini;
        this.model = model.trim();

        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehavior(
                TransactionDefinition.PROPAGATION_REQUIRES_NEW
        );
    }

    public record Analysis(
            UUID id,
            UUID requestKey,
            String status,
            String model,
            BigDecimal aestheticScore,
            String errorMessage,
            Instant createdAt,
            JsonNode result,
            JsonNode policySnapshot
    ) {
    }

    private record Policy(
            UUID id,
            String snapshot,
            String instructions,
            Map<String, Integer> weights
    ) {
    }

    private record Work(
            UUID id,
            UUID actorId,
            Evidence evidence,
            Policy policy
    ) {
    }

    public List<Analysis> getHistory(UUID tradeInId, String email) {
        requireAdmin(email);
        requireTradeIn(tradeInId, false);

        return jdbc.query(
                """
                SELECT id, request_key, status, model, aesthetic_score,
                       error_message, created_at, result, policy_snapshot
                FROM trade_in_visual_analyses
                WHERE trade_in_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 20
                """,
                (rs, row) -> new Analysis(
                        rs.getObject("id", UUID.class),
                        rs.getObject("request_key", UUID.class),
                        rs.getString("status"),
                        rs.getString("model"),
                        rs.getBigDecimal("aesthetic_score"),
                        rs.getString("error_message"),
                        rs.getTimestamp("created_at").toInstant(),
                        parseNullable(rs.getString("result")),
                        parseNullable(rs.getString("policy_snapshot"))
                ),
                tradeInId
        );
    }

    // No colocar @Transactional aquí:
    // la llamada a Google debe quedar fuera de la transacción.
    public Analysis analyze(
            UUID tradeInId,
            UUID requestKey,
            String email
    ) {
        if (requestKey == null) {
            throw problem(
                    HttpStatus.BAD_REQUEST,
                    "La clave de solicitud es obligatoria"
            );
        }

        Work work = Objects.requireNonNull(
                transaction.execute(status ->
                        prepare(tradeInId, requestKey, email)
                )
        );

        // Una petición repetida consulta el intento existente.
        if (work.evidence() == null) {
            return find(work.id());
        }

        try {
            Result result = gemini.analyze(
                    work.evidence(),
                    work.policy().instructions()
            );

            BigDecimal score = calculateScore(
                    result,
                    work.policy().weights()
            );

            String resultJson = mapper.writeValueAsString(result);

            transaction.executeWithoutResult(status -> {
                int updated = jdbc.update(
                        """
                        UPDATE trade_in_visual_analyses
                        SET status = 'SUCCEEDED',
                            result = CAST(? AS jsonb),
                            aesthetic_score = ?,
                            finished_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                          AND status = 'PROCESSING'
                        """,
                        resultJson,
                        score,
                        work.id()
                );

                if (updated == 1) {
                    audit(
                            work.actorId(),
                            work.id(),
                            "VISUAL_ANALYSIS_SUCCEEDED"
                    );
                }
            });

        } catch (RuntimeException ex) {
            String message = ex instanceof ResponseStatusException response
                    ? response.getReason()
                    : "No se pudo completar o guardar el análisis";

            if (message == null || message.isBlank()) {
                message = "No se pudo completar el análisis";
            }

            String safeMessage = message.substring(
                    0,
                    Math.min(message.length(), 500)
            );

            transaction.executeWithoutResult(status -> {
                int updated = jdbc.update(
                        """
                        UPDATE trade_in_visual_analyses
                        SET status = 'FAILED',
                            error_code = 'ANALYSIS_FAILED',
                            error_message = ?,
                            finished_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                          AND status = 'PROCESSING'
                        """,
                        safeMessage,
                        work.id()
                );

                if (updated == 1) {
                    audit(
                            work.actorId(),
                            work.id(),
                            "VISUAL_ANALYSIS_FAILED"
                    );
                }
            });
        }

        return find(work.id());
    }

    private Work prepare(
            UUID tradeInId,
            UUID requestKey,
            String email
    ) {
        UUID actorId = requireAdmin(email);

        // Serializa la creación de análisis de este canje.
        requireTradeIn(tradeInId, true);

        // Recuperación de intentos interrumpidos por un cierre del backend.
        // No significa que Google no haya procesado la solicitud.
        List<UUID> expired = jdbc.query(
                """
                UPDATE trade_in_visual_analyses
                SET status = 'FAILED',
                    error_code = 'PROCESSING_EXPIRED',
                    error_message =
                        'El procesamiento quedó interrumpido. '
                        'El resultado remoto es desconocido.',
                    finished_at = CURRENT_TIMESTAMP
                WHERE trade_in_id = ?
                  AND status IN ('QUEUED', 'PROCESSING')
                  AND COALESCE(started_at, created_at)
                      < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
                RETURNING id
                """,
                (rs, row) -> rs.getObject("id", UUID.class),
                tradeInId
        );

        for (UUID id : expired) {
            audit(actorId, id, "VISUAL_ANALYSIS_EXPIRED");
        }

        List<UUID> previous = jdbc.query(
                """
                SELECT id
                FROM trade_in_visual_analyses
                WHERE trade_in_id = ? AND request_key = ?
                """,
                (rs, row) -> rs.getObject("id", UUID.class),
                tradeInId,
                requestKey
        );

        if (!previous.isEmpty()) {
            return new Work(previous.getFirst(), actorId, null, null);
        }

        Boolean processing = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_visual_analyses
                    WHERE trade_in_id = ?
                      AND status IN ('QUEUED', 'PROCESSING')
                )
                """,
                Boolean.class,
                tradeInId
        );

        if (Boolean.TRUE.equals(processing)) {
            throw problem(
                    HttpStatus.CONFLICT,
                    "Esta solicitud ya tiene un análisis en proceso"
            );
        }

        Evidence evidence = evidenceService.loadForAnalysis(
                tradeInId,
                email
        );

        Policy policy = loadPolicy();
        UUID analysisId = UUID.randomUUID();

        List<Map<String, Object>> photosSnapshot = evidence.photos()
                .stream()
                .map(photo -> Map.<String, Object>of(
                        "photoId", photo.photoId().toString(),
                        "angle", photo.angle(),
                        "contentType", photo.contentType(),
                        "width", photo.width(),
                        "height", photo.height(),
                        "updatedAt", photo.updatedAt().toString(),
                        "sha256", photo.sha256()
                ))
                .toList();

        jdbc.update(
                """
                INSERT INTO trade_in_visual_analyses (
                    id, trade_in_id, policy_id, request_key,
                    status, policy_snapshot, photos_snapshot,
                    provider, model, requested_by, started_at
                )
                VALUES (
                    ?, ?, ?, ?, 'PROCESSING',
                    CAST(? AS jsonb), CAST(? AS jsonb),
                    'GEMINI', ?, ?, CURRENT_TIMESTAMP
                )
                """,
                analysisId,
                tradeInId,
                policy.id(),
                requestKey,
                policy.snapshot(),
                mapper.writeValueAsString(photosSnapshot),
                model,
                actorId
        );

        for (var photo : evidence.photos()) {
            jdbc.update(
                    """
                    INSERT INTO trade_in_visual_analysis_photos (
                        analysis_id, angle, source_photo_id,
                        content_type, image_data, sha256
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    analysisId,
                    photo.angle(),
                    photo.photoId(),
                    photo.contentType(),
                    photo.bytes(),
                    photo.sha256()
            );
        }

        audit(actorId, analysisId, "VISUAL_ANALYSIS_STARTED");

        return new Work(analysisId, actorId, evidence, policy);
    }

    private Policy loadPolicy() {
        List<String> snapshots = jdbc.query(
                """
                SELECT jsonb_build_object(
                    'id', id,
                    'name', name,
                    'version', version,
                    'instructions', instructions,
                    'criteria', criteria
                )::text AS snapshot
                FROM trade_in_visual_policies
                WHERE active = TRUE
                FOR SHARE
                """,
                (rs, row) -> rs.getString("snapshot")
        );

        if (snapshots.size() != 1) {
            throw problem(
                    HttpStatus.CONFLICT,
                    "Debe existir exactamente una política visual activa"
            );
        }

        JsonNode policy = mapper.readTree(snapshots.getFirst());
        JsonNode criteria = policy.path("criteria");

        if (!criteria.isArray() || criteria.size() != 4) {
            throw invalidPolicy();
        }

        Map<String, Integer> weights = new HashMap<>();

        for (JsonNode criterion : criteria) {
            String code = criterion.path("code").asText();
            JsonNode weightNode = criterion.path("weight");

            if (!weightNode.isIntegralNumber()
                    || !weightNode.canConvertToInt()) {
                throw invalidPolicy();
            }

            int weight = weightNode.asInt();

            if (weight <= 0 || weight > 100
                    || weights.putIfAbsent(code, weight) != null) {
                throw invalidPolicy();
            }
        }

        if (!weights.keySet().equals(
                Set.of("FRONT", "BACK", "LEFT", "RIGHT")
        ) || weights.values().stream().mapToInt(Integer::intValue).sum() != 100) {
            throw invalidPolicy();
        }

        return new Policy(
                UUID.fromString(policy.path("id").asText()),
                snapshots.getFirst(),
                policy.path("instructions").asText(),
                Map.copyOf(weights)
        );
    }

    private BigDecimal calculateScore(
            Result result,
            Map<String, Integer> weights
    ) {
        if (result.angles().stream().anyMatch(angle -> !angle.evaluable())) {
            return null;
        }

        BigDecimal weighted = BigDecimal.ZERO;

        for (var angle : result.angles()) {
            int angleScore = 100 - angle.severity() * 25;

            weighted = weighted.add(
                    BigDecimal.valueOf(angleScore)
                            .multiply(BigDecimal.valueOf(
                                    weights.get(angle.angle())
                            ))
            );
        }

        return weighted.divide(
                BigDecimal.valueOf(100),
                2,
                RoundingMode.HALF_UP
        );
    }

    private Analysis find(UUID id) {
        return jdbc.queryForObject(
                """
                SELECT id, request_key, status, model, aesthetic_score,
                       error_message, created_at, result, policy_snapshot
                FROM trade_in_visual_analyses
                WHERE id = ?
                """,
                (rs, row) -> new Analysis(
                        rs.getObject("id", UUID.class),
                        rs.getObject("request_key", UUID.class),
                        rs.getString("status"),
                        rs.getString("model"),
                        rs.getBigDecimal("aesthetic_score"),
                        rs.getString("error_message"),
                        rs.getTimestamp("created_at").toInstant(),
                        parseNullable(rs.getString("result")),
                        parseNullable(rs.getString("policy_snapshot"))
                ),
                id
        );
    }

    private UUID requireAdmin(String email) {
        List<UUID> actors = jdbc.query(
                """
                SELECT u.id
                FROM users u
                WHERE u.email = ?
                  AND u.enabled = TRUE
                  AND EXISTS (
                      SELECT 1
                      FROM user_roles ur
                      JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id
                        AND r.name = 'ADMIN'
                  )
                """,
                (rs, row) -> rs.getObject("id", UUID.class),
                email
        );

        if (actors.isEmpty()) {
            throw problem(
                    HttpStatus.FORBIDDEN,
                    "Solo un administrador puede gestionar los análisis"
            );
        }

        return actors.getFirst();
    }

    private void requireTradeIn(UUID id, boolean lock) {
        String sql = "SELECT id FROM trade_in_requests WHERE id = ?";

        if (lock) {
            sql += " FOR UPDATE";
        }

        List<UUID> ids = jdbc.query(
                sql,
                (rs, row) -> rs.getObject("id", UUID.class),
                id
        );

        if (ids.isEmpty()) {
            throw problem(HttpStatus.NOT_FOUND, "La solicitud no existe");
        }
    }

    private void audit(UUID actorId, UUID analysisId, String action) {
        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id
                )
                VALUES (?, ?, 'TRADE_IN_VISUAL_ANALYSIS', ?)
                """,
                actorId,
                action,
                analysisId
        );
    }

    private JsonNode parseNullable(String json) {
        return json == null ? null : mapper.readTree(json);
    }

    private ResponseStatusException invalidPolicy() {
        return problem(
                HttpStatus.CONFLICT,
                "La política debe tener los cuatro ángulos "
                + "con pesos enteros positivos que sumen 100"
        );
    }

    private ResponseStatusException problem(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
    
    public record EvidencePhoto(
            String angle,
            String sha256,
            String imageUrl
    ) {
    }

    public record EvidenceContent(
            String contentType,
            byte[] bytes
    ) {
    }

    public List<EvidencePhoto> getEvidencePhotos(
            UUID tradeInId,
            UUID analysisId,
            String email
    ) {
        requireAdmin(email);
        requireAnalysisOwnership(tradeInId, analysisId);

        return jdbc.query(
                """
                SELECT angle, sha256
                FROM trade_in_visual_analysis_photos
                WHERE analysis_id = ?
                ORDER BY CASE angle
                    WHEN 'FRONT' THEN 1
                    WHEN 'BACK' THEN 2
                    WHEN 'LEFT' THEN 3
                    WHEN 'RIGHT' THEN 4
                END
                """,
                (rs, row) -> {
                    String angle = rs.getString("angle");

                    String imageUrl =
                            "/api/v1/admin/trade-ins/" + tradeInId
                            + "/visual-analyses/" + analysisId
                            + "/photos/" + angle + "/content";

                    return new EvidencePhoto(
                            angle,
                            rs.getString("sha256"),
                            imageUrl
                    );
                },
                analysisId
        );
    }

    public EvidenceContent getEvidenceContent(
            UUID tradeInId,
            UUID analysisId,
            String angle,
            String email
    ) {
        requireAdmin(email);
        requireAnalysisOwnership(tradeInId, analysisId);

        if (!Set.of("FRONT", "BACK", "LEFT", "RIGHT").contains(angle)) {
            throw problem(HttpStatus.NOT_FOUND, "La fotografía no existe");
        }

        List<EvidenceContent> photos = jdbc.query(
                """
                SELECT content_type, image_data
                FROM trade_in_visual_analysis_photos
                WHERE analysis_id = ? AND angle = ?
                """,
                (rs, row) -> new EvidenceContent(
                        rs.getString("content_type"),
                        rs.getBytes("image_data")
                ),
                analysisId,
                angle
        );

        if (photos.isEmpty()) {
            throw problem(HttpStatus.NOT_FOUND, "La fotografía no existe");
        }

        return photos.getFirst();
    }

    private void requireAnalysisOwnership(UUID tradeInId, UUID analysisId) {
        Boolean exists = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_visual_analyses
                    WHERE id = ? AND trade_in_id = ?
                )
                """,
                Boolean.class,
                analysisId,
                tradeInId
        );

        if (!Boolean.TRUE.equals(exists)) {
            throw problem(
                    HttpStatus.NOT_FOUND,
                    "El análisis no existe para esta solicitud"
            );
        }
    }
}