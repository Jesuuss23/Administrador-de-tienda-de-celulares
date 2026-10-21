package com.celucanje.order.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderCompletionService {

    private final JdbcTemplate jdbc;
    private final OrderCreditService credits;
    private final boolean testEnabled;

    public OrderCompletionService(
            JdbcTemplate jdbc,
            OrderCreditService credits,
            @Value("${app.payments.test-enabled:false}")
            boolean testEnabled
    ) {
        this.jdbc = jdbc;
        this.credits = credits;
        this.testEnabled = testEnabled;
    }

    private record LockedOrder(
            UUID userId,
            String status,
            BigDecimal amountDue,
            Instant expiresAt
    ) {
    }

    private record ReservedUnit(UUID id, String status) {
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void completeTest(UUID orderId, UUID actorId) {
        if (!testEnabled) {
            throw conflict(
                    "Las operaciones de prueba no están habilitadas"
            );
        }

        LockedOrder order = jdbc.queryForObject(
                """
                SELECT
                    user_id,
                    status,
                    amount_due,
                    expires_at
                FROM sales_orders
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> new LockedOrder(
                        rs.getObject("user_id", UUID.class),
                        rs.getString("status"),
                        rs.getBigDecimal("amount_due"),
                        rs.getTimestamp("expires_at").toInstant()
                ),
                orderId
        );

        if (order == null
                || !order.userId().equals(actorId)
                || !"PENDING_PAYMENT".equals(order.status())) {
            throw conflict(
                    "El pedido ya no está disponible para completar"
            );
        }

        List<ReservedUnit> units = jdbc.query(
                """
                SELECT u.id, u.status
                FROM inventory_reservations r
                JOIN inventory_units u ON u.id = r.unit_id
                WHERE r.order_id = ?
                  AND r.status = 'ACTIVE'
                ORDER BY u.id
                FOR UPDATE OF r, u
                """,
                (rs, rowNumber) -> new ReservedUnit(
                        rs.getObject("id", UUID.class),
                        rs.getString("status")
                ),
                orderId
        );

        Long itemCount = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM sales_order_items
                WHERE order_id = ?
                """,
                Long.class,
                orderId
        );

        if (itemCount == null
                || itemCount == 0
                || units.size() != itemCount
                || units.stream().anyMatch(
                        unit -> !"RESERVED".equals(unit.status())
                )) {
            throw conflict(
                    "La reserva del pedido no está disponible"
            );
        }

        Long approvedCount = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM payment_attempts
                WHERE order_id = ?
                  AND status = 'APPROVED'
                """,
                Long.class,
                orderId
        );

        List<BigDecimal> approvedAmounts = jdbc.query(
                """
                SELECT p.amount
                FROM payment_attempts p
                JOIN sales_orders o ON o.id = p.order_id
                WHERE p.order_id = ?
                  AND p.status = 'APPROVED'
                  AND p.environment = 'TEST'
                  AND p.currency = o.currency
                FOR SHARE OF p
                """,
                (rs, rowNumber) -> rs.getBigDecimal("amount"),
                orderId
        );

        if (order.amountDue().signum() == 0) {
            if (approvedCount == null || approvedCount != 0) {
                throw conflict(
                        "Un pedido cubierto con crédito no debe tener un cobro"
                );
            }
        } else {
            if (approvedCount == null
                    || approvedCount != 1
                    || approvedAmounts.size() != 1
                    || approvedAmounts.getFirst()
                            .compareTo(order.amountDue()) != 0) {
                throw conflict(
                        "El pago aprobado no coincide con la diferencia del pedido"
                );
            }
        }

        credits.consume(orderId, actorId);

        /*
         * Se comprueba la hora después de obtener todos los bloqueos.
         * Si venció, la transacción también revierte el consumo del crédito.
         */
        Instant databaseNow = jdbc.queryForObject(
                "SELECT clock_timestamp()",
                (rs, rowNumber) -> rs.getTimestamp(1).toInstant()
        );

        if (databaseNow == null
                || !order.expiresAt().isAfter(databaseNow)) {
            throw conflict(
                    "La reserva venció. Actualiza tus pedidos."
            );
        }

        for (ReservedUnit unit : units) {
            int updated = jdbc.update(
                    """
                    UPDATE inventory_units
                    SET status = 'SOLD',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND status = 'RESERVED'
                    """,
                    unit.id()
            );

            if (updated != 1) {
                throw conflict(
                        "No se pudo completar la venta de una unidad"
                );
            }
        }

        jdbc.update(
                """
                UPDATE inventory_reservations
                SET status = 'CONSUMED'
                WHERE order_id = ?
                  AND status = 'ACTIVE'
                """,
                orderId
        );

        jdbc.update(
                """
                UPDATE sales_orders
                SET status = 'PAID',
                    settlement_environment = 'TEST',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                orderId
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
                    'ORDER_SETTLED',
                    'SALES_ORDER',
                    ?,
                    jsonb_build_object(
                        'environment', 'TEST',
                        'amountDue', CAST(? AS numeric)
                    )
                )
                """,
                actorId,
                orderId,
                order.amountDue()
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }
}