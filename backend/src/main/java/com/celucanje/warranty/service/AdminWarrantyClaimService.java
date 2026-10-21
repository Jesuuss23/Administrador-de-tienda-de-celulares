package com.celucanje.warranty.service;

import com.celucanje.warranty.dto.AdminWarrantyClaimDtos;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminWarrantyClaimService {

    private final JdbcTemplate jdbc;

    public AdminWarrantyClaimService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<AdminWarrantyClaimDtos.Item> getRecent() {
        return jdbc.query(
                """
                SELECT
                    c.id,
                    c.warranty_id,
                    o.order_number,
                    u.full_name,
                    u.email,
                    i.product_name,
                    w.environment,
                    c.description,
                    c.status,
                    c.resolution_notes,
                    c.created_at,
                    c.updated_at
                FROM warranty_claims c
                JOIN warranties w ON w.id = c.warranty_id
                JOIN sales_orders o ON o.id = w.order_id
                JOIN users u ON u.id = o.user_id
                JOIN sales_order_items i
                    ON i.order_id = w.order_id
                   AND i.unit_id = w.unit_id
                ORDER BY c.created_at DESC, c.id
                LIMIT 100
                """,
                (rs, rowNumber) -> new AdminWarrantyClaimDtos.Item(
                        rs.getObject("id", UUID.class),
                        rs.getObject("warranty_id", UUID.class),
                        rs.getLong("order_number"),
                        rs.getString("full_name"),
                        rs.getString("email"),
                        rs.getString("product_name"),
                        rs.getString("environment"),
                        rs.getString("description"),
                        rs.getString("status"),
                        rs.getString("resolution_notes"),
                        rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("updated_at").toInstant()
                )
        );
    }

    @Transactional
    public void update(
            UUID claimId,
            AdminWarrantyClaimDtos.UpdateRequest request,
            String actorEmail
    ) {
        List<String> states = jdbc.query(
                """
                SELECT status
                FROM warranty_claims
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> rs.getString("status"),
                claimId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud no existe"
            );
        }

        var current = AdminWarrantyClaimDtos.Status.valueOf(
                states.getFirst()
        );

        if (current != request.expectedStatus()) {
            throw conflict(
                    "La solicitud cambió de estado. Actualiza la lista."
            );
        }

        var next = request.nextStatus();

        boolean allowed = switch (current) {
            case RECEIVED ->
                next == AdminWarrantyClaimDtos.Status.UNDER_REVIEW;

            case UNDER_REVIEW ->
                next == AdminWarrantyClaimDtos.Status.ACCEPTED
                || next == AdminWarrantyClaimDtos.Status.REJECTED;

            case ACCEPTED ->
                next == AdminWarrantyClaimDtos.Status.RESOLVED;

            case REJECTED, RESOLVED -> false;
        };

        if (!allowed) {
            throw conflict(
                    "No se permite ese cambio de estado"
            );
        }

        boolean closing =
                next == AdminWarrantyClaimDtos.Status.REJECTED
                || next == AdminWarrantyClaimDtos.Status.RESOLVED;

        String notes = request.notes();

        if (closing && (notes == null || notes.length() < 20)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Explica el resultado usando entre 20 y 2000 caracteres"
            );
        }

        if (!closing && notes != null && !notes.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Las notas de cierre corresponden al rechazo o resolución"
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
                    "No tienes permisos para gestionar solicitudes"
            );
        }

        UUID actorId = actors.getFirst();

        if (closing) {
            jdbc.update(
                    """
                    UPDATE warranty_claims
                    SET status = ?,
                        resolution_notes = ?,
                        resolved_at = CURRENT_TIMESTAMP,
                        resolved_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    next.name(),
                    notes,
                    actorId,
                    claimId
            );
        } else {
            jdbc.update(
                    """
                    UPDATE warranty_claims
                    SET status = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    next.name(),
                    claimId
            );
        }

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
                    'WARRANTY_CLAIM_STATUS_CHANGED',
                    'WARRANTY_CLAIM',
                    ?,
                    jsonb_build_object(
                        'previousStatus', CAST(? AS text),
                        'nextStatus', CAST(? AS text)
                    )
                )
                """,
                actorId,
                claimId,
                current.name(),
                next.name()
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }
}