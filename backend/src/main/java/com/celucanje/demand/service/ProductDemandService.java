package com.celucanje.demand.service;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductDemandService {

    private final JdbcTemplate jdbc;

    public ProductDemandService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ViewRequest(
            @NotNull UUID eventId,
            @NotNull UUID productId
    ) {
    }

    public record Receipt(boolean received) {
    }

    public record ProductItem(
            UUID productId,
            String brand,
            String model,
            int storageGb,
            String color,
            boolean active,
            long views,
            long availableUnits
    ) {
    }

    public record Report(
            int days,
            long totalViews,
            long productsViewed,
            List<ProductItem> products
    ) {
    }

    @Transactional
    public Receipt record(ViewRequest request) {
        /*
         * Solo registra productos publicados.
         * Reenviar el mismo event_id no aumenta el contador.
         */
        jdbc.update(
                """
                INSERT INTO catalog_product_view_events (
                    event_id, product_id
                )
                SELECT ?, p.id
                FROM catalog_products p
                WHERE p.id = ?
                  AND p.active = TRUE
                ON CONFLICT (event_id) DO NOTHING
                """,
                request.eventId(),
                request.productId()
        );

        return new Receipt(true);
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public Report report(int days) {
        if (days != 7 && days != 30 && days != 90) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Selecciona un período de 7, 30 o 90 días"
            );
        }

        long[] totals = jdbc.queryForObject(
                """
                SELECT
                    COUNT(*) AS total_views,
                    COUNT(DISTINCT product_id) AS products_viewed
                FROM catalog_product_view_events
                WHERE created_at >= CURRENT_TIMESTAMP
                    - (CAST(? AS integer) * INTERVAL '1 day')
                """,
                (rs, row) -> new long[]{
                    rs.getLong("total_views"),
                    rs.getLong("products_viewed")
                },
                days
        );

        List<ProductItem> products = jdbc.query(
                """
                WITH visits AS (
                    SELECT product_id, COUNT(*) AS views
                    FROM catalog_product_view_events
                    WHERE created_at >= CURRENT_TIMESTAMP
                        - (CAST(? AS integer) * INTERVAL '1 day')
                    GROUP BY product_id
                )
                SELECT
                    p.id,
                    p.brand,
                    p.model,
                    p.storage_gb,
                    p.color,
                    p.active,
                    v.views,
                    (
                        SELECT COUNT(*)
                        FROM inventory_units u
                        WHERE u.product_id = p.id
                          AND u.status = 'AVAILABLE'
                    ) AS available_units
                FROM visits v
                JOIN catalog_products p ON p.id = v.product_id
                ORDER BY v.views DESC, p.brand, p.model, p.id
                LIMIT 20
                """,
                (rs, row) -> new ProductItem(
                        rs.getObject("id", UUID.class),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getBoolean("active"),
                        rs.getLong("views"),
                        rs.getLong("available_units")
                ),
                days
        );

        return new Report(
                days,
                totals == null ? 0 : totals[0],
                totals == null ? 0 : totals[1],
                products
        );
    }
}