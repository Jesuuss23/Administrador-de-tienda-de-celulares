package com.celucanje.dashboard.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminDashboardService {

    private final JdbcTemplate jdbc;

    public AdminDashboardService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Summary(
            long tradeInsToReview,
            long tradeInsToStock,
            long unitsToInspect,
            long availableUnits,
            long ordersToPrepare,
            long ordersReady
    ) {
    }

    @Transactional(readOnly = true)
    public Summary getSummary() {
        return jdbc.queryForObject(
                """
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM trade_in_requests
                        WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')
                    ) AS trade_ins_to_review,
                    (
                        SELECT COUNT(*)
                        FROM trade_in_requests t
                        JOIN trade_in_credits c
                            ON c.trade_in_id = t.id
                        WHERE t.status = 'CONFIRMED'
                          AND c.status <> 'VOID'
                          AND c.currency = 'PEN'
                          AND NOT EXISTS (
                              SELECT 1
                              FROM inventory_units u
                              WHERE u.source_trade_in_id = t.id
                          )
                    ) AS trade_ins_to_stock,
                    (
                        SELECT COUNT(*)
                        FROM inventory_units
                        WHERE status = 'PENDING_INSPECTION'
                    ) AS units_to_inspect,
                    (
                        SELECT COUNT(*)
                        FROM inventory_units
                        WHERE status = 'AVAILABLE'
                    ) AS available_units,
                    (
                        SELECT COUNT(*)
                        FROM sales_orders o
                        LEFT JOIN order_fulfillments f
                            ON f.order_id = o.id
                        WHERE o.status = 'PAID'
                          AND COALESCE(f.status, 'PENDING') = 'PENDING'
                    ) AS orders_to_prepare,
                    (
                        SELECT COUNT(*)
                        FROM sales_orders o
                        JOIN order_fulfillments f
                            ON f.order_id = o.id
                        WHERE o.status = 'PAID'
                          AND f.status = 'READY'
                    ) AS orders_ready
                """,
                (rs, rowNumber) -> new Summary(
                        rs.getLong("trade_ins_to_review"),
                        rs.getLong("trade_ins_to_stock"),
                        rs.getLong("units_to_inspect"),
                        rs.getLong("available_units"),
                        rs.getLong("orders_to_prepare"),
                        rs.getLong("orders_ready")
                )
        );
    }
}