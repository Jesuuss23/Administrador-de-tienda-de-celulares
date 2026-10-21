package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.AdminTradeInDtos;
import com.celucanje.tradein.dto.TradeInPhotoDtos;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminTradeInService {

    private final JdbcTemplate jdbc;

    public AdminTradeInService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<AdminTradeInDtos.Item> getRecent() {
        return jdbc.query(
                """
                SELECT
                    t.id,
                    u.full_name,
                    u.email,
                    t.brand,
                    t.model,
                    t.storage_gb,
                    t.color,
                    t.imei,
                    t.condition_description,
                    t.functional_issues,
                    t.status,
                    (
                        SELECT COUNT(*)
                        FROM trade_in_photos p
                        WHERE p.trade_in_id = t.id
                    ) AS photo_count,
                    t.created_at,
                    t.updated_at
                FROM trade_in_requests t
                JOIN users u ON u.id = t.customer_id
                ORDER BY t.created_at DESC, t.id
                LIMIT 100
                """,
                (rs, rowNumber) -> new AdminTradeInDtos.Item(
                        rs.getObject("id", UUID.class),
                        rs.getString("full_name"),
                        rs.getString("email"),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("imei"),
                        rs.getString("condition_description"),
                        rs.getString("functional_issues"),
                        rs.getString("status"),
                        rs.getInt("photo_count"),
                        rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("updated_at").toInstant()
                )
        );
    }

    @Transactional(readOnly = true)
    public List<TradeInPhotoDtos.Item> getPhotos(UUID tradeInId) {
        requireRequest(tradeInId);

        return jdbc.query(
                """
                SELECT
                    id,
                    angle,
                    width,
                    height,
                    updated_at
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
                    UUID photoId = rs.getObject("id", UUID.class);

                    return new TradeInPhotoDtos.Item(
                            photoId,
                            TradeInPhotoDtos.Angle.valueOf(
                                    rs.getString("angle")
                            ),
                            rs.getInt("width"),
                            rs.getInt("height"),
                            rs.getTimestamp("updated_at").toInstant(),
                            "/api/v1/admin/trade-ins/"
                                    + tradeInId
                                    + "/photos/"
                                    + photoId
                                    + "/content"
                    );
                },
                tradeInId
        );
    }

    @Transactional(readOnly = true)
    public byte[] getPhotoContent(
            UUID tradeInId,
            UUID photoId
    ) {
        List<byte[]> photos = jdbc.query(
                """
                SELECT image_data
                FROM trade_in_photos
                WHERE id = ?
                  AND trade_in_id = ?
                """,
                (rs, rowNumber) -> rs.getBytes("image_data"),
                photoId,
                tradeInId
        );

        if (photos.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La fotografía no existe"
            );
        }

        return photos.getFirst();
    }

    @Transactional
    public void startReview(
            UUID tradeInId,
            String actorEmail
    ) {
        /*
         * Usa el mismo bloqueo que la carga de fotografías.
         * La revisión y el reemplazo de imágenes no pueden
         * ejecutarse simultáneamente sobre esta solicitud.
         */
        List<String> states = jdbc.query(
                """
                SELECT status
                FROM trade_in_requests
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> rs.getString("status"),
                tradeInId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud no existe"
            );
        }

        if (!"SUBMITTED".equals(states.getFirst())) {
            throw conflict(
                    "La solicitud ya cambió de estado. Actualiza la lista."
            );
        }

        Integer photoCount = jdbc.queryForObject(
                """
                SELECT COUNT(DISTINCT angle)
                FROM trade_in_photos
                WHERE trade_in_id = ?
                  AND angle IN ('FRONT', 'BACK', 'LEFT', 'RIGHT')
                """,
                Integer.class,
                tradeInId
        );

        if (photoCount == null || photoCount != 4) {
            throw conflict(
                    "Se requieren fotos del frente, parte posterior "
                    + "y ambos laterales para iniciar la revisión"
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
                    "No tienes permisos para revisar canjes"
            );
        }

        UUID actorId = actors.getFirst();

        jdbc.update(
                """
                UPDATE trade_in_requests
                SET status = 'UNDER_REVIEW',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                tradeInId
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    details
                )
                VALUES (
                    ?,
                    'TRADE_IN_REVIEW_STARTED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'previousStatus', 'SUBMITTED',
                        'nextStatus', 'UNDER_REVIEW',
                        'photoCount', 4
                    )
                )
                """,
                actorId,
                tradeInId
        );
    }

    private void requireRequest(UUID tradeInId) {
        Boolean exists = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_requests
                    WHERE id = ?
                )
                """,
                Boolean.class,
                tradeInId
        );

        if (!Boolean.TRUE.equals(exists)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud no existe"
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