package com.celucanje.order.service;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderReleaseService {

    private final JdbcTemplate jdbc;
    private final OrderCreditService credits;

    public OrderReleaseService(
            JdbcTemplate jdbc,
            OrderCreditService credits
    ) {
        this.jdbc = jdbc;
        this.credits = credits;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void release(
            UUID orderId,
            UUID actorId,
            String targetStatus
    ) {
        if (!"EXPIRED".equals(targetStatus)
                && !"CANCELLED".equals(targetStatus)) {
            throw new IllegalArgumentException(
                    "Estado de liberación no válido"
            );
        }

        String currentStatus = jdbc.queryForObject(
                """
                SELECT status
                FROM sales_orders
                WHERE id = ?
                FOR UPDATE
                """,
                String.class,
                orderId
        );

        if (targetStatus.equals(currentStatus)) {
            return;
        }

        if (!"PENDING_PAYMENT".equals(currentStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido ya no está pendiente de pago"
            );
        }

        // Bloqueamos las reservas y las unidades antes de liberarlas.
        jdbc.query(
                """
                SELECT u.id
                FROM inventory_reservations r
                JOIN inventory_units u ON u.id = r.unit_id
                WHERE r.order_id = ?
                  AND r.status = 'ACTIVE'
                ORDER BY u.id
                FOR UPDATE OF r, u
                """,
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                orderId
        );

        jdbc.update(
                """
                UPDATE inventory_units u
                SET status = 'AVAILABLE',
                    updated_at = CURRENT_TIMESTAMP
                FROM inventory_reservations r
                WHERE r.unit_id = u.id
                  AND r.order_id = ?
                  AND r.status = 'ACTIVE'
                  AND u.status = 'RESERVED'
                """,
                orderId
        );

        jdbc.update(
                """
                UPDATE inventory_reservations
                SET status = 'RELEASED',
                    released_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
                  AND status = 'ACTIVE'
                """,
                orderId
        );

        credits.release(orderId, actorId);

        jdbc.update(
                """
                UPDATE sales_orders
                SET status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                targetStatus,
                orderId
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id,
                    action,
                    entity_type,
                    entity_id
                )
                VALUES (?, ?, 'SALES_ORDER', ?)
                """,
                actorId,
                "ORDER_" + targetStatus,
                orderId
        );
    }
}