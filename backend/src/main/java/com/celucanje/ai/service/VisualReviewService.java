package com.celucanje.ai.service;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VisualReviewService {

    private final JdbcTemplate jdbc;

    public VisualReviewService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public enum Decision {
        AGREE,
        DISAGREE,
        NEEDS_MORE_EVIDENCE
    }

    public record SaveRequest(
            @NotNull(message = "La clave de solicitud es obligatoria")
            UUID requestKey,

            @NotNull(message = "Selecciona una decisión")
            Decision decision,

            @NotBlank(message = "Registra las observaciones de la revisión")
            @Size(max = 2000, message = "Se permiten hasta 2000 caracteres")
            String notes
    ) {
        public SaveRequest {
            notes = notes == null ? null : notes.trim();
        }
    }

    public record Review(
            UUID id,
            UUID analysisId,
            UUID requestKey,
            Decision decision,
            String notes,
            UUID reviewedBy,
            String reviewerName,
            Instant reviewedAt
    ) {
    }

    public record Response(Review review) {
    }

    @Transactional(readOnly = true)
    public Response get(
            UUID tradeInId,
            UUID analysisId,
            String email
    ) {
        requireAdmin(email);
        requireAnalysis(tradeInId, analysisId, false);

        return new Response(findReview(analysisId));
    }

    @Transactional
    public Response save(
            UUID tradeInId,
            UUID analysisId,
            SaveRequest request,
            String email
    ) {
        UUID actorId = requireAdmin(email);

        String analysisStatus = requireAnalysis(
                tradeInId,
                analysisId,
                true
        );

        Review existing = findReview(analysisId);

        if (existing != null) {
            boolean sameRequest =
                    existing.requestKey().equals(request.requestKey())
                    && existing.reviewedBy().equals(actorId)
                    && existing.decision() == request.decision()
                    && Objects.equals(existing.notes(), request.notes());

            if (sameRequest) {
                return new Response(existing);
            }

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Este análisis ya tiene una revisión final. "
                    + "Actualiza el panel para consultarla."
            );
        }

        if (!"SUCCEEDED".equals(analysisStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo se pueden revisar análisis completados"
            );
        }

        UUID reviewId = UUID.randomUUID();

        jdbc.update(
                """
                INSERT INTO trade_in_visual_reviews (
                    id, analysis_id, request_key,
                    decision, notes, reviewed_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                reviewId,
                analysisId,
                request.requestKey(),
                request.decision().name(),
                request.notes(),
                actorId
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, 'VISUAL_ANALYSIS_REVIEWED',
                    'TRADE_IN_VISUAL_ANALYSIS', ?,
                    jsonb_build_object(
                        'reviewId', CAST(? AS text),
                        'decision', CAST(? AS text)
                    )
                )
                """,
                actorId,
                analysisId,
                reviewId.toString(),
                request.decision().name()
        );

        return new Response(findReview(analysisId));
    }

    private Review findReview(UUID analysisId) {
        List<Review> reviews = jdbc.query(
                """
                SELECT r.id, r.analysis_id, r.request_key,
                       r.decision, r.notes, r.reviewed_by,
                       r.reviewed_at, u.full_name AS reviewer_name
                FROM trade_in_visual_reviews r
                JOIN users u ON u.id = r.reviewed_by
                WHERE r.analysis_id = ?
                """,
                (rs, row) -> new Review(
                        rs.getObject("id", UUID.class),
                        rs.getObject("analysis_id", UUID.class),
                        rs.getObject("request_key", UUID.class),
                        Decision.valueOf(rs.getString("decision")),
                        rs.getString("notes"),
                        rs.getObject("reviewed_by", UUID.class),
                        rs.getString("reviewer_name"),
                        rs.getTimestamp("reviewed_at").toInstant()
                ),
                analysisId
        );

        return reviews.isEmpty() ? null : reviews.getFirst();
    }

    private String requireAnalysis(
            UUID tradeInId,
            UUID analysisId,
            boolean lock
    ) {
        String sql = """
                SELECT status
                FROM trade_in_visual_analyses
                WHERE id = ? AND trade_in_id = ?
                """;

        if (lock) {
            sql += " FOR UPDATE";
        }

        List<String> states = jdbc.query(
                sql,
                (rs, row) -> rs.getString("status"),
                analysisId,
                tradeInId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El análisis no existe para esta solicitud"
            );
        }

        return states.getFirst();
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Solo un administrador puede revisar los análisis"
            );
        }

        return actors.getFirst();
    }
}