package com.celucanje.warranty.service;

import com.celucanje.warranty.dto.WarrantyClaimDtos;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WarrantyClaimService {

    private final JdbcTemplate jdbc;

    public WarrantyClaimService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<WarrantyClaimDtos.Item> getForCustomer(
            String email,
            UUID orderId,
            UUID warrantyId
    ) {
        Boolean ownsWarranty = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM warranties w
                    JOIN sales_orders o ON o.id = w.order_id
                    JOIN users u ON u.id = o.user_id
                    WHERE w.id = ?
                      AND o.id = ?
                      AND u.email = ?
                      AND u.enabled = TRUE
                )
                """,
                Boolean.class,
                warrantyId,
                orderId,
                email
        );

        if (!Boolean.TRUE.equals(ownsWarranty)) {
            throw notFound();
        }

        return jdbc.query(
                """
                SELECT
                    id,
                    warranty_id,
                    description,
                    status,
                    resolution_notes,
                    created_at,
                    updated_at,
                    resolved_at
                FROM warranty_claims
                WHERE warranty_id = ?
                ORDER BY created_at DESC, id
                """,
                this::mapItem,
                warrantyId
        );
    }

    @Transactional
    public WarrantyClaimDtos.Item create(
            String email,
            UUID orderId,
            UUID warrantyId,
            WarrantyClaimDtos.CreateRequest request
    ) {
        /*
         * El bloqueo serializa solicitudes simultáneas
         * sobre la misma garantía.
         */
        List<WarrantyContext> warranties = jdbc.query(
                """
                SELECT
                    w.status,
                    w.starts_at,
                    w.ends_at,
                    u.id AS customer_id
                FROM warranties w
                JOIN sales_orders o ON o.id = w.order_id
                JOIN users u ON u.id = o.user_id
                WHERE w.id = ?
                  AND o.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                FOR UPDATE OF w
                """,
                (rs, rowNumber) -> new WarrantyContext(
                        rs.getString("status"),
                        rs.getTimestamp("starts_at").toInstant(),
                        rs.getTimestamp("ends_at").toInstant(),
                        rs.getObject("customer_id", UUID.class)
                ),
                warrantyId,
                orderId,
                email
        );

        if (warranties.isEmpty()) {
            throw notFound();
        }

        /*
         * Si es un reintento, devolvemos la solicitud original.
         * Esto también funciona si la garantía venció después
         * de que la primera solicitud se guardó.
         */
        List<WarrantyClaimDtos.Item> previous = jdbc.query(
                """
                SELECT
                    id,
                    warranty_id,
                    description,
                    status,
                    resolution_notes,
                    created_at,
                    updated_at,
                    resolved_at
                FROM warranty_claims
                WHERE warranty_id = ?
                  AND request_key = ?
                """,
                this::mapItem,
                warrantyId,
                request.requestKey()
        );

        if (!previous.isEmpty()) {
            WarrantyClaimDtos.Item existing = previous.getFirst();

            if (!existing.description().equals(request.description())) {
                throw conflict(
                        "La clave de solicitud ya se utilizó "
                        + "con una descripción diferente"
                );
            }

            return existing;
        }

        WarrantyContext warranty = warranties.getFirst();
        Instant now = Instant.now();

        if (!"ISSUED".equals(warranty.status())) {
            throw conflict(
                    "La garantía está anulada y no admite nuevas solicitudes"
            );
        }

        if (now.isBefore(warranty.startsAt())) {
            throw conflict("La garantía todavía no ha iniciado");
        }

        if (!now.isBefore(warranty.endsAt())) {
            throw conflict(
                    "La garantía está vencida y no admite nuevas solicitudes"
            );
        }

        Boolean hasOpenClaim = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM warranty_claims
                    WHERE warranty_id = ?
                      AND status IN (
                          'RECEIVED',
                          'UNDER_REVIEW',
                          'ACCEPTED'
                      )
                )
                """,
                Boolean.class,
                warrantyId
        );

        if (Boolean.TRUE.equals(hasOpenClaim)) {
            throw conflict(
                    "Ya tienes una solicitud abierta para esta garantía"
            );
        }

        UUID claimId = UUID.randomUUID();

        jdbc.update(
                """
                INSERT INTO warranty_claims (
                    id,
                    warranty_id,
                    request_key,
                    description
                )
                VALUES (?, ?, ?, ?)
                """,
                claimId,
                warrantyId,
                request.requestKey(),
                request.description()
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
                    'WARRANTY_CLAIM_CREATED',
                    'WARRANTY_CLAIM',
                    ?,
                    jsonb_build_object(
                        'warrantyId', CAST(? AS text),
                        'orderId', CAST(? AS text)
                    )
                )
                """,
                warranty.customerId(),
                claimId,
                warrantyId.toString(),
                orderId.toString()
        );

        return jdbc.queryForObject(
                """
                SELECT
                    id,
                    warranty_id,
                    description,
                    status,
                    resolution_notes,
                    created_at,
                    updated_at,
                    resolved_at
                FROM warranty_claims
                WHERE id = ?
                """,
                this::mapItem,
                claimId
        );
    }

    private WarrantyClaimDtos.Item mapItem(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        var resolvedAt = rs.getTimestamp("resolved_at");

        return new WarrantyClaimDtos.Item(
                rs.getObject("id", UUID.class),
                rs.getObject("warranty_id", UUID.class),
                rs.getString("description"),
                rs.getString("status"),
                rs.getString("resolution_notes"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                resolvedAt == null ? null : resolvedAt.toInstant()
        );
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "La garantía no existe"
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }

    private record WarrantyContext(
            String status,
            Instant startsAt,
            Instant endsAt,
            UUID customerId
    ) {
    }
}