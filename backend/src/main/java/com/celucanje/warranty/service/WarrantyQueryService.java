package com.celucanje.warranty.service;

import com.celucanje.warranty.dto.WarrantyDtos;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WarrantyQueryService {

    private final JdbcTemplate jdbc;
    private final int expiringSoonDays;

    public WarrantyQueryService(
            JdbcTemplate jdbc,
            @Value("${app.warranties.expiring-soon-days:15}")
            int expiringSoonDays
    ) {
        if (expiringSoonDays < 1) {
            throw new IllegalArgumentException(
                    "El umbral de vencimiento debe ser mayor que cero"
            );
        }

        this.jdbc = jdbc;
        this.expiringSoonDays = expiringSoonDays;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public List<WarrantyDtos.Item> getForCustomer(
            String email,
            UUID orderId
    ) {
        Boolean ownsOrder = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM sales_orders o
                    JOIN users u ON u.id = o.user_id
                    WHERE o.id = ?
                      AND u.email = ?
                      AND u.enabled = TRUE
                )
                """,
                Boolean.class,
                orderId,
                email
        );

        if (!Boolean.TRUE.equals(ownsOrder)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El pedido no existe"
            );
        }

        Map<UUID, List<WarrantyDtos.Identifier>> identifiers =
                new HashMap<>();

        var identifierRows = jdbc.query(
                """
                SELECT
                    w.id AS warranty_id,
                    identifier.value ->> 'type' AS identifier_type,
                    identifier.value ->> 'value' AS identifier_value
                FROM warranties w
                CROSS JOIN LATERAL
                    jsonb_array_elements(w.identifiers_snapshot)
                    WITH ORDINALITY AS identifier(value, position)
                WHERE w.order_id = ?
                ORDER BY w.id, identifier.position
                """,
                (rs, rowNumber) -> new IdentifierRow(
                        rs.getObject("warranty_id", UUID.class),
                        rs.getString("identifier_type"),
                        rs.getString("identifier_value")
                ),
                orderId
        );

        for (IdentifierRow row : identifierRows) {
            identifiers
                    .computeIfAbsent(
                            row.warrantyId(),
                            ignored -> new ArrayList<>()
                    )
                    .add(new WarrantyDtos.Identifier(
                            row.type(),
                            row.value()
                    ));
        }

        Instant now = Instant.now();

        return jdbc.query(
                """
                SELECT
                    w.id,
                    w.unit_id,
                    i.product_name,
                    w.policy_name,
                    w.duration_days,
                    w.coverage,
                    w.exclusions,
                    w.environment,
                    w.starts_at,
                    w.ends_at,
                    w.status,
                    w.void_reason
                FROM warranties w
                JOIN sales_order_items i
                    ON i.order_id = w.order_id
                   AND i.unit_id = w.unit_id
                WHERE w.order_id = ?
                ORDER BY i.product_name, w.id
                """,
                (rs, rowNumber) -> {
                    UUID warrantyId = rs.getObject(
                            "id",
                            UUID.class
                    );

                    Instant startsAt = rs.getTimestamp(
                            "starts_at"
                    ).toInstant();

                    Instant endsAt = rs.getTimestamp(
                            "ends_at"
                    ).toInstant();

                    return new WarrantyDtos.Item(
                            warrantyId,
                            rs.getObject("unit_id", UUID.class),
                            rs.getString("product_name"),
                            rs.getString("policy_name"),
                            rs.getInt("duration_days"),
                            rs.getString("coverage"),
                            rs.getString("exclusions"),
                            rs.getString("environment"),
                            startsAt,
                            endsAt,
                            calculateStatus(
                                    rs.getString("status"),
                                    startsAt,
                                    endsAt,
                                    now
                            ),
                            rs.getString("void_reason"),
                            List.copyOf(
                                    identifiers.getOrDefault(
                                            warrantyId,
                                            List.of()
                                    )
                            )
                    );
                },
                orderId
        );
    }

    private String calculateStatus(
            String recordStatus,
            Instant startsAt,
            Instant endsAt,
            Instant now
    ) {
        if ("VOID".equals(recordStatus)) {
            return "VOID";
        }

        if (now.isBefore(startsAt)) {
            return "NOT_STARTED";
        }

        if (!now.isBefore(endsAt)) {
            return "EXPIRED";
        }

        Instant warningThreshold = now.plus(
                expiringSoonDays,
                ChronoUnit.DAYS
        );

        if (!endsAt.isAfter(warningThreshold)) {
            return "EXPIRING_SOON";
        }

        return "ACTIVE";
    }

    private record IdentifierRow(
            UUID warrantyId,
            String type,
            String value
    ) {
    }
}