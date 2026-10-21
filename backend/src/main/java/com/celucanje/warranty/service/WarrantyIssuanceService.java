package com.celucanje.warranty.service;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WarrantyIssuanceService {

    private final JdbcTemplate jdbc;

    public WarrantyIssuanceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }
    private record Funding(
            BigDecimal creditApplied,
            BigDecimal amountDue,
            String environment
    ) {
    }
    /*
     * Este método debe ejecutarse dentro de la transacción
     * que registra la entrega.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void issueForDeliveredOrder(UUID orderId, UUID actorId) {

        Boolean delivered = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM sales_orders o
                    JOIN order_fulfillments f ON f.order_id = o.id
                    WHERE o.id = ?
                      AND o.status = 'PAID'
                      AND f.status = 'DELIVERED'
                      AND f.delivered_at IS NOT NULL
                      AND f.delivered_by = ?
                )
                """,
                Boolean.class,
                orderId,
                actorId
        );

        if (!Boolean.TRUE.equals(delivered)) {
            throw conflict(
                    "La garantía requiere un pedido pagado y entregado"
            );
        }

        Funding funding = jdbc.queryForObject(
                """
                SELECT
                    o.credit_applied,
                    o.amount_due,
                    COALESCE(
                        o.settlement_environment,
                        (
                            SELECT p.environment
                            FROM payment_attempts p
                            WHERE p.order_id = o.id
                              AND p.status = 'APPROVED'
                        )
                    ) AS environment
                FROM sales_orders o
                WHERE o.id = ?
                """,
                (rs, rowNumber) -> new Funding(
                        rs.getBigDecimal("credit_applied"),
                        rs.getBigDecimal("amount_due"),
                        rs.getString("environment")
                ),
                orderId
        );

        if (funding == null) {
            throw conflict(
                    "No se encontró la información de pago del pedido"
            );
        }

        String environment = funding.environment();

        if (!"TEST".equals(environment)) {
            throw conflict(
                    "La emisión de garantías LIVE todavía no está habilitada"
            );
        }

        if (funding.creditApplied().signum() > 0) {
            Boolean creditConsumed = jdbc.queryForObject(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM order_credit_allocations a
                        JOIN sales_orders o ON o.id = a.order_id
                        JOIN trade_in_credits c ON c.id = a.credit_id
                        WHERE a.order_id = ?
                          AND a.status = 'CONSUMED'
                          AND a.credit_id = o.trade_in_credit_id
                          AND a.amount = o.credit_applied
                          AND c.customer_id = o.user_id
                          AND c.currency = o.currency
                    )
                    """,
                    Boolean.class,
                    orderId
            );

            if (!Boolean.TRUE.equals(creditConsumed)) {
                throw conflict(
                        "El crédito del pedido no está consumido correctamente"
                );
            }
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
                  AND p.environment = ?
                  AND p.currency = o.currency
                FOR SHARE OF p
                """,
                (rs, rowNumber) -> rs.getBigDecimal("amount"),
                orderId,
                environment
        );

        if (funding.amountDue().signum() > 0) {
            if (approvedCount == null
                    || approvedCount != 1
                    || approvedAmounts.size() != 1
                    || approvedAmounts.getFirst()
                            .compareTo(funding.amountDue()) != 0) {
                throw conflict(
                        "El pago aprobado no coincide con la diferencia del pedido"
                );
            }
        } else {
            if (funding.creditApplied().signum() <= 0
                    || approvedCount == null
                    || approvedCount != 0) {
                throw conflict(
                        "El pedido sin cobro debe estar cubierto totalmente por crédito"
                );
            }
        }

        Integer expectedCount = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM sales_order_items
                WHERE order_id = ?
                """,
                Integer.class,
                orderId
        );

        if (expectedCount == null || expectedCount == 0) {
            throw conflict("El pedido no contiene equipos");
        }

        /*
         * Bloqueamos las políticas seleccionadas durante la emisión.
         * Así no pueden editarse o desactivarse a mitad de la operación.
         */
        List<String> coveredConditions = jdbc.query(
                """
                SELECT product_condition
                FROM warranty_policies
                WHERE environment = ?
                  AND active = TRUE
                ORDER BY product_condition
                FOR SHARE
                """,
                (rs, rowNumber) -> rs.getString("product_condition"),
                environment
        );

        List<String> requiredConditions = jdbc.query(
                """
                SELECT DISTINCT condition
                FROM sales_order_items
                WHERE order_id = ?
                ORDER BY condition
                """,
                (rs, rowNumber) -> rs.getString("condition"),
                orderId
        );

        for (String condition : requiredConditions) {
            if (!coveredConditions.contains(condition)) {
                throw conflict(
                        "Falta una política de garantía activa para "
                        + condition + " en el entorno " + environment
                );
            }
        }

        /*
         * Cada garantía conserva:
         * - La política aplicada.
         * - Una copia de su contenido.
         * - Los identificadores de la unidad.
         * - La fecha efectiva de entrega.
         *
         * Para esta política de prueba, cada día equivale a 24 horas.
         */
        int inserted = jdbc.update(
                """
                INSERT INTO warranties (
                    order_id,
                    unit_id,
                    policy_id,
                    policy_name,
                    policy_version,
                    duration_days,
                    coverage,
                    exclusions,
                    identifiers_snapshot,
                    environment,
                    starts_at,
                    ends_at,
                    issued_by
                )
                SELECT
                    i.order_id,
                    i.unit_id,
                    p.id,
                    p.name,
                    p.version,
                    p.duration_days,
                    p.coverage,
                    p.exclusions,
                    identifiers.data,
                    p.environment,
                    f.delivered_at,
                    f.delivered_at
                        + p.duration_days * INTERVAL '24 hours',
                    ?
                FROM sales_order_items i
                JOIN inventory_units u
                    ON u.id = i.unit_id
                JOIN order_fulfillments f
                    ON f.order_id = i.order_id
                JOIN warranty_policies p
                    ON p.product_condition = i.condition
                   AND p.environment = ?
                   AND p.active = TRUE
                CROSS JOIN LATERAL (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'type', ui.identifier_type,
                            'value', ui.value
                        )
                        ORDER BY ui.identifier_type, ui.value
                    ) AS data
                    FROM unit_identifiers ui
                    WHERE ui.unit_id = i.unit_id
                ) identifiers
                WHERE i.order_id = ?
                  AND u.status = 'SOLD'
                  AND f.status = 'DELIVERED'
                  AND identifiers.data IS NOT NULL
                """,
                actorId,
                environment,
                orderId
        );

        if (inserted != expectedCount) {
            throw conflict(
                    "No se pudieron emitir todas las garantías. "
                    + "Verifica que cada equipo esté vendido y tenga "
                    + "un IMEI o número de serie registrado."
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
                    'WARRANTIES_ISSUED',
                    'SALES_ORDER',
                    ?,
                    jsonb_build_object(
                        'count', CAST(? AS integer),
                        'environment', CAST(? AS text)
                    )
                )
                """,
                actorId,
                orderId,
                inserted,
                environment
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }
}