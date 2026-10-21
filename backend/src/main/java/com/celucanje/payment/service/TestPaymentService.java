package com.celucanje.payment.service;

import com.celucanje.payment.dto.PaymentDtos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import com.celucanje.order.service.OrderCompletionService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(
        name = "app.payments.test-enabled",
        havingValue = "true"
)
public class TestPaymentService {

    private final JdbcTemplate jdbc;
    private final OrderCompletionService completion;

    public TestPaymentService(
            JdbcTemplate jdbc,
            OrderCompletionService completion
    ) {
        this.jdbc = jdbc;
        this.completion = completion;
    }

    private record LockedOrder(
            UUID id,
            UUID userId,
            String status,
            BigDecimal amount,
            String currency,
            Instant expiresAt
    ) {
    }

    private record ReservedUnit(UUID id, String status) {
    }

    private static final RowMapper<PaymentDtos.Response> PAYMENT_MAPPER =
            (rs, rowNumber) -> new PaymentDtos.Response(
                    rs.getObject("id", UUID.class),
                    rs.getObject("order_id", UUID.class),
                    rs.getString("environment"),
                    rs.getString("status"),
                    rs.getBigDecimal("amount"),
                    rs.getString("currency"),
                    rs.getTimestamp("created_at").toInstant()
            );

    @Transactional(readOnly = true)
    public List<PaymentDtos.Response> getAttempts(
            String email,
            UUID orderId
    ) {
        Long ownedOrders = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.id = ? AND u.email = ?
                """,
                Long.class,
                orderId,
                email
        );

        if (ownedOrders == null || ownedOrders == 0) {
            throw notFound();
        }

        return jdbc.query(
                """
                SELECT *
                FROM payment_attempts
                WHERE order_id = ?
                ORDER BY created_at DESC, id
                """,
                PAYMENT_MAPPER,
                orderId
        );
    }

    @Transactional
    public PaymentDtos.Response simulate(
            String email,
            UUID orderId,
            PaymentDtos.TestPaymentRequest request
    ) {
        List<LockedOrder> orders = jdbc.query(
                """
                SELECT
                    o.id, o.user_id, o.status,
                    o.amount_due, o.currency, o.expires_at
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                FOR UPDATE OF o
                """,
                (rs, rowNumber) -> new LockedOrder(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("status"),
                        rs.getBigDecimal("amount_due"),
                        rs.getString("currency"),
                        rs.getTimestamp("expires_at").toInstant()
                ),
                orderId,
                email
        );

        if (orders.isEmpty()) {
            throw notFound();
        }

        LockedOrder order = orders.getFirst();

        List<PaymentDtos.Response> previous = jdbc.query(
                """
                SELECT *
                FROM payment_attempts
                WHERE order_id = ? AND request_key = ?
                """,
                PAYMENT_MAPPER,
                orderId,
                request.requestKey()
        );

        if (!previous.isEmpty()) {
            PaymentDtos.Response payment = previous.getFirst();

            if (!payment.status().equals(request.outcome().name())) {
                throw conflict(
                        "La clave ya fue utilizada con otro resultado"
                );
            }

            return payment;
        }

        if (!"PENDING_PAYMENT".equals(order.status())) {
            throw conflict("El pedido ya no está pendiente de pago");
        }
        if (order.amount().signum() <= 0) {
            throw conflict(
                    "Este pedido se completa con crédito y no necesita un pago"
            );
        }

        List<ReservedUnit> units = jdbc.query(
                """
                SELECT u.id, u.status
                FROM inventory_reservations r
                JOIN inventory_units u ON u.id = r.unit_id
                WHERE r.order_id = ? AND r.status = 'ACTIVE'
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
                "SELECT COUNT(*) FROM sales_order_items WHERE order_id = ?",
                Long.class,
                orderId
        );

        if (itemCount == null
                || itemCount == 0
                || units.size() != itemCount
                || units.stream().anyMatch(
                        unit -> !"RESERVED".equals(unit.status())
                )) {
            throw conflict("La reserva del pedido no está disponible");
        }

        // Se comprueba después de obtener los bloqueos.
        Instant databaseNow = jdbc.queryForObject(
                "SELECT clock_timestamp()",
                (rs, rowNumber) -> rs.getTimestamp(1).toInstant()
        );

        if (databaseNow == null
                || !order.expiresAt().isAfter(databaseNow)) {
            throw conflict(
                    "La reserva venció. No se puede registrar este pago."
            );
        }

        UUID paymentId = UUID.randomUUID();
        String outcome = request.outcome().name();

        jdbc.update(
                """
                INSERT INTO payment_attempts (
                    id, order_id, request_key,
                    environment, status, amount, currency
                )
                VALUES (?, ?, ?, 'TEST', ?, ?, ?)
                """,
                paymentId,
                orderId,
                request.requestKey(),
                outcome,
                order.amount(),
                order.currency()
        );

        if (request.outcome() == PaymentDtos.TestOutcome.APPROVED) {
            completion.completeTest(
                    orderId,
                    order.userId()
            );
        }

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, 'TEST_PAYMENT_PROCESSED', 'SALES_ORDER', ?,
                    jsonb_build_object(
                        'paymentId', CAST(? AS text),
                        'environment', 'TEST',
                        'result', CAST(? AS text)
                    )
                )
                """,
                order.userId(),
                orderId,
                paymentId.toString(),
                outcome
        );

        return jdbc.queryForObject(
                "SELECT * FROM payment_attempts WHERE id = ?",
                PAYMENT_MAPPER,
                paymentId
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "El pedido no existe"
        );
    }
}