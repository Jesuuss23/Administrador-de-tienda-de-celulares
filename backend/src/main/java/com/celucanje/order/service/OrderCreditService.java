package com.celucanje.order.service;

import com.celucanje.order.dto.OrderDtos;

import java.math.BigDecimal;
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
public class OrderCreditService {

    private final JdbcTemplate jdbc;
    private final boolean testEnabled;

    public OrderCreditService(
            JdbcTemplate jdbc,
            @Value("${app.payments.test-enabled:false}")
            boolean testEnabled
    ) {
        this.jdbc = jdbc;
        this.testEnabled = testEnabled;
    }

    private record Allocation(
            UUID creditId,
            BigDecimal amount,
            String status
    ) {
    }

    @Transactional(readOnly = true)
    public List<OrderDtos.CreditBalance> getBalances(String email) {
        return jdbc.query(
                """
                SELECT
                    c.id,
                    c.amount,
                    c.reserved_amount,
                    c.used_amount,
                    c.amount
                        - c.reserved_amount
                        - c.used_amount AS available_amount,
                    c.currency,
                    c.status
                FROM trade_in_credits c
                JOIN users u ON u.id = c.customer_id
                WHERE u.email = ?
                  AND u.enabled = TRUE
                  AND c.status <> 'VOID'
                ORDER BY c.confirmed_at DESC, c.id
                """,
                (rs, rowNumber) -> new OrderDtos.CreditBalance(
                        rs.getObject("id", UUID.class),
                        rs.getBigDecimal("amount"),
                        rs.getBigDecimal("reserved_amount"),
                        rs.getBigDecimal("used_amount"),
                        rs.getBigDecimal("available_amount"),
                        rs.getString("currency"),
                        rs.getString("status")
                ),
                email
        );
    }

    /*
     * El servicio del pedido debe tener bloqueados el pedido
     * y sus unidades antes de llamar a estas operaciones.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reserve(
            UUID orderId,
            UUID userId,
            UUID creditId,
            BigDecimal total,
            BigDecimal expectedApplied
    ) {
        BigDecimal expected = expectedApplied == null
                ? BigDecimal.ZERO
                : expectedApplied;

        if (creditId == null) {
            if (expected.signum() != 0) {
                throw conflict(
                        "Selecciona el crédito que deseas aplicar"
                );
            }

            return;
        }

        if (!testEnabled) {
            throw conflict(
                    "El uso de créditos todavía está habilitado solo en TEST"
            );
        }

        List<BigDecimal> balances = jdbc.query(
                """
                SELECT
                    amount
                        - reserved_amount
                        - used_amount AS available_amount
                FROM trade_in_credits
                WHERE id = ?
                  AND customer_id = ?
                  AND currency = 'PEN'
                  AND status IN ('AVAILABLE', 'RESERVED')
                FOR UPDATE
                """,
                (rs, rowNumber) ->
                        rs.getBigDecimal("available_amount"),
                creditId,
                userId
        );

        if (balances.isEmpty()
                || balances.getFirst().signum() <= 0) {
            throw conflict(
                    "El crédito seleccionado no está disponible"
            );
        }

        BigDecimal available = balances.getFirst();
        BigDecimal applied = available.min(total);

        if (applied.compareTo(expected) != 0) {
            throw conflict(
                    "El saldo del crédito cambió. "
                    + "Actualiza el carrito antes de confirmar."
            );
        }

        int creditUpdated = jdbc.update(
                """
                UPDATE trade_in_credits
                SET reserved_amount = reserved_amount + ?
                WHERE id = ?
                  AND amount - reserved_amount - used_amount >= ?
                """,
                applied,
                creditId,
                applied
        );

        if (creditUpdated != 1) {
            throw conflict("No se pudo reservar el crédito");
        }

        int orderUpdated = jdbc.update(
                """
                UPDATE sales_orders
                SET trade_in_credit_id = ?,
                    credit_applied = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND user_id = ?
                  AND status = 'PENDING_PAYMENT'
                  AND trade_in_credit_id IS NULL
                  AND total_amount = ?
                  AND currency = 'PEN'
                """,
                creditId,
                applied,
                orderId,
                userId,
                total
        );

        if (orderUpdated != 1) {
            throw conflict(
                    "No se pudo asociar el crédito al pedido"
            );
        }

        jdbc.update(
                """
                INSERT INTO order_credit_allocations (
                    order_id,
                    credit_id,
                    amount
                )
                VALUES (?, ?, ?)
                """,
                orderId,
                creditId,
                applied
        );

        refreshStatus(creditId);

        audit(
                userId,
                orderId,
                "ORDER_CREDIT_RESERVED",
                creditId,
                applied
        );
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void consume(UUID orderId, UUID actorId) {
        Allocation allocation = lockAllocation(orderId);

        if (allocation == null) {
            return;
        }

        if (!"ACTIVE".equals(allocation.status())) {
            throw conflict(
                    "El crédito del pedido ya no está reservado"
            );
        }

        int updated = jdbc.update(
                """
                UPDATE trade_in_credits
                SET reserved_amount = reserved_amount - ?,
                    used_amount = used_amount + ?
                WHERE id = ?
                  AND reserved_amount >= ?
                  AND status <> 'VOID'
                """,
                allocation.amount(),
                allocation.amount(),
                allocation.creditId(),
                allocation.amount()
        );

        if (updated != 1) {
            throw conflict(
                    "No se pudo consumir el crédito reservado"
            );
        }

        jdbc.update(
                """
                UPDATE order_credit_allocations
                SET status = 'CONSUMED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
                  AND status = 'ACTIVE'
                """,
                orderId
        );

        refreshStatus(allocation.creditId());

        audit(
                actorId,
                orderId,
                "ORDER_CREDIT_CONSUMED",
                allocation.creditId(),
                allocation.amount()
        );
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void release(UUID orderId, UUID actorId) {
        Allocation allocation = lockAllocation(orderId);

        if (allocation == null
                || "RELEASED".equals(allocation.status())) {
            return;
        }

        if (!"ACTIVE".equals(allocation.status())) {
            throw conflict(
                    "No se puede liberar un crédito ya consumido"
            );
        }

        int updated = jdbc.update(
                """
                UPDATE trade_in_credits
                SET reserved_amount = reserved_amount - ?
                WHERE id = ?
                  AND reserved_amount >= ?
                """,
                allocation.amount(),
                allocation.creditId(),
                allocation.amount()
        );

        if (updated != 1) {
            throw conflict(
                    "El saldo reservado del crédito no coincide"
            );
        }

        jdbc.update(
                """
                UPDATE order_credit_allocations
                SET status = 'RELEASED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
                  AND status = 'ACTIVE'
                """,
                orderId
        );

        refreshStatus(allocation.creditId());

        audit(
                actorId,
                orderId,
                "ORDER_CREDIT_RELEASED",
                allocation.creditId(),
                allocation.amount()
        );
    }

    private Allocation lockAllocation(UUID orderId) {
        List<Allocation> allocations = jdbc.query(
                """
                SELECT
                    a.credit_id,
                    a.amount,
                    a.status
                FROM order_credit_allocations a
                JOIN trade_in_credits c ON c.id = a.credit_id
                JOIN sales_orders o ON o.id = a.order_id
                WHERE a.order_id = ?
                  AND o.trade_in_credit_id = a.credit_id
                  AND o.credit_applied = a.amount
                  AND c.customer_id = o.user_id
                  AND c.currency = o.currency
                FOR UPDATE OF c, a
                """,
                (rs, rowNumber) -> new Allocation(
                        rs.getObject("credit_id", UUID.class),
                        rs.getBigDecimal("amount"),
                        rs.getString("status")
                ),
                orderId
        );

        if (!allocations.isEmpty()) {
            return allocations.getFirst();
        }

        BigDecimal applied = jdbc.queryForObject(
                """
                SELECT credit_applied
                FROM sales_orders
                WHERE id = ?
                """,
                BigDecimal.class,
                orderId
        );

        if (applied == null || applied.signum() != 0) {
            throw conflict(
                    "No se encontró la reserva de crédito del pedido"
            );
        }

        return null;
    }

    private void refreshStatus(UUID creditId) {
        jdbc.update(
                """
                UPDATE trade_in_credits
                SET status = CASE
                    WHEN amount - reserved_amount - used_amount > 0
                        THEN 'AVAILABLE'
                    WHEN reserved_amount > 0
                        THEN 'RESERVED'
                    ELSE 'USED'
                END
                WHERE id = ?
                  AND status <> 'VOID'
                """,
                creditId
        );
    }

    private void audit(
            UUID actorId,
            UUID orderId,
            String action,
            UUID creditId,
            BigDecimal amount
    ) {
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
                    ?,
                    'SALES_ORDER',
                    ?,
                    jsonb_build_object(
                        'creditId', CAST(? AS text),
                        'amount', CAST(? AS numeric)
                    )
                )
                """,
                actorId,
                action,
                orderId,
                creditId.toString(),
                amount
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }
}