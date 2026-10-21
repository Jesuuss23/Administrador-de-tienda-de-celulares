package com.celucanje.order.service;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReservationExpirationService {

    private final JdbcTemplate jdbc;
    private final OrderReleaseService releases;

    public ReservationExpirationService(
            JdbcTemplate jdbc,
            OrderReleaseService releases
    ) {
        this.jdbc = jdbc;
        this.releases = releases;
    }

    @Transactional
    public void expireOrders() {
        List<UUID> orderIds = jdbc.query(
                """
                SELECT id
                FROM sales_orders
                WHERE status = 'PENDING_PAYMENT'
                  AND expires_at <= CURRENT_TIMESTAMP
                ORDER BY expires_at, id
                LIMIT 20
                FOR UPDATE SKIP LOCKED
                """,
                (rs, rowNumber) -> rs.getObject("id", UUID.class)
        );

        for (UUID orderId : orderIds) {
            releases.release(
                    orderId,
                    null,
                    "EXPIRED"
            );
        }
    }
}