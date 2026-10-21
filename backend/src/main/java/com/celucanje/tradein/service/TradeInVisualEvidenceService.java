package com.celucanje.tradein.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import java.time.Instant;

import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInVisualEvidenceService {

    private static final Set<String> REQUIRED_ANGLES = Set.of(
            "FRONT",
            "BACK",
            "LEFT",
            "RIGHT"
    );

    private static final Set<String> ALLOWED_STATES = Set.of(
            "UNDER_REVIEW",
            "QUOTED",
            "ACCEPTED",
            "RECEIVED",
            "CONFIRMED"
    );

    private final JdbcTemplate jdbc;

    public TradeInVisualEvidenceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /*
     * Estos objetos son internos.
     * No deben devolverse directamente desde un controlador HTTP.
     */
    public record PhotoEvidence(
            UUID photoId,
            String angle,
            String contentType,
            int width,
            int height,
            Instant updatedAt,
            String sha256,
            byte[] bytes
    ) {
        public PhotoEvidence {
            bytes = bytes.clone();
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }

    public record Evidence(
            UUID tradeInId,
            UUID requestedBy,
            String tradeInStatus,
            List<PhotoEvidence> photos
    ) {
        public Evidence {
            photos = List.copyOf(photos);
        }
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public Evidence loadForAnalysis(
            UUID tradeInId,
            String actorEmail
    ) {
        if (tradeInId == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El identificador del canje es obligatorio"
            );
        }

        if (actorEmail == null || actorEmail.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Debes iniciar sesión"
            );
        }

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
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                actorEmail
        );

        if (actors.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tienes permisos para analizar fotografías"
            );
        }

        List<String> states = jdbc.query(
                """
                SELECT status
                FROM trade_in_requests
                WHERE id = ?
                """,
                (rs, rowNumber) -> rs.getString("status"),
                tradeInId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud de canje no existe"
            );
        }

        String status = states.getFirst();

        if (!ALLOWED_STATES.contains(status)) {
            throw conflict(
                    "La solicitud debe estar en revisión o en una "
                    + "etapa posterior habilitada para analizar sus fotos"
            );
        }

        List<PhotoEvidence> photos = jdbc.query(
                """
                SELECT
                    id,
                    angle,
                    content_type,
                    width,
                    height,
                    updated_at,
                    image_data
                FROM trade_in_photos
                WHERE trade_in_id = ?
                ORDER BY CASE angle
                    WHEN 'FRONT' THEN 1
                    WHEN 'BACK' THEN 2
                    WHEN 'LEFT' THEN 3
                    WHEN 'RIGHT' THEN 4
                END
                """,
                (rs, rowNumber) -> {
                    byte[] bytes = rs.getBytes("image_data");
                    String contentType = rs.getString("content_type");

                    if (bytes == null
                            || bytes.length == 0
                            || bytes.length > 6 * 1024 * 1024
                            || !"image/jpeg".equals(contentType)) {
                        throw conflict(
                                "Una fotografía no tiene un contenido válido"
                        );
                    }

                    return new PhotoEvidence(
                            rs.getObject("id", UUID.class),
                            rs.getString("angle"),
                            contentType,
                            rs.getInt("width"),
                            rs.getInt("height"),
                            rs.getTimestamp("updated_at").toInstant(),
                            sha256(bytes),
                            bytes
                    );
                },
                tradeInId
        );

        Set<String> angles = photos.stream()
                .map(PhotoEvidence::angle)
                .collect(Collectors.toSet());

        if (photos.size() != 4 || !angles.equals(REQUIRED_ANGLES)) {
            throw conflict(
                    "Se necesitan las fotografías del frente, "
                    + "parte posterior y ambos laterales"
            );
        }

        return new Evidence(
                tradeInId,
                actors.getFirst(),
                status,
                photos
        );
    }

    private static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "No se pudo calcular la huella de la fotografía",
                    exception
            );
        }
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }
}