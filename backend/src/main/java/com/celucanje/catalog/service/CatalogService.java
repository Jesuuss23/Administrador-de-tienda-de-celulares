package com.celucanje.catalog.service;

import com.celucanje.catalog.dto.CatalogPage;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    private final JdbcTemplate jdbcTemplate;

    public CatalogService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private static final String GROUPED_QUERY = """
            SELECT
                p.id,
                p.brand,
                p.model,
                p.storage_gb,
                p.color,
                p.image_url,
                u.condition,
                u.currency,
                MIN(u.selling_price) AS price_from,
                COUNT(*) AS available_units
            FROM catalog_products p
            JOIN inventory_units u ON u.product_id = p.id
            WHERE p.active = TRUE
              AND u.status = 'AVAILABLE'
              AND POSITION(
                    LOWER(?) IN LOWER(
                        p.brand || ' ' || p.model || ' ' || p.color
                    )
                  ) > 0
              AND (? = '' OR u.condition = ?)
            GROUP BY
                p.id,
                p.brand,
                p.model,
                p.storage_gb,
                p.color,
                p.image_url,
                u.condition,
                u.currency
            """;

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public CatalogPage findProducts(
            String search,
            String condition,
            int page,
            int size
    ) {
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (" + GROUPED_QUERY + ") catalog",
                Long.class,
                search,
                condition,
                condition
        );

        String pageQuery = GROUPED_QUERY + """
                 ORDER BY p.brand, p.model, p.id, u.condition, u.currency
                 LIMIT ? OFFSET ?
                """;

        List<CatalogPage.Item> items = jdbcTemplate.query(
                pageQuery,
                (rs, rowNumber) -> new CatalogPage.Item(
                        rs.getObject("id", UUID.class),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("image_url"),
                        rs.getString("condition"),
                        rs.getBigDecimal("price_from"),
                        rs.getString("currency"),
                        rs.getLong("available_units")
                ),
                search,
                condition,
                condition,
                size,
                (long) page * size
        );

        return new CatalogPage(
                items,
                page,
                size,
                total == null ? 0 : total
        );
    }
}