package com.celucanje.catalog.service;

import com.celucanje.catalog.dto.AdminProductPage;
import com.celucanje.catalog.dto.CreateProductRequest;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminProductService {

    private final JdbcTemplate jdbcTemplate;

    public AdminProductService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public AdminProductPage findAll(int page, int size) {

        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM catalog_products",
                Long.class
        );

        List<AdminProductPage.Item> items = jdbcTemplate.query(
                """
                SELECT id, sku, brand, model, storage_gb,
                       color, active, created_at
                FROM catalog_products
                ORDER BY created_at DESC, id
                LIMIT ? OFFSET ?
                """,
                (rs, rowNumber) -> new AdminProductPage.Item(
                        rs.getObject("id", UUID.class),
                        rs.getString("sku"),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getBoolean("active"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                size,
                (long) page * size
        );

        return new AdminProductPage(
                items,
                page,
                size,
                total == null ? 0 : total
        );
    }
    @Transactional(readOnly = true)
    public AdminProductPage.Item findById(UUID productId) {
        List<AdminProductPage.Item> results = jdbcTemplate.query(
                """
                SELECT id, sku, brand, model, storage_gb,
                       color, active, created_at
                FROM catalog_products
                WHERE id = ?
                """,
                (rs, rowNumber) -> new AdminProductPage.Item(
                        rs.getObject("id", UUID.class),
                        rs.getString("sku"),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getBoolean("active"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                productId
        );

        if (results.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El producto no existe"
            );
        }

        return results.getFirst();
    }
    @Transactional
    public UUID create(CreateProductRequest request, String actorEmail) {

        Long existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM catalog_products WHERE sku = ?",
                Long.class,
                request.sku()
        );

        if (existing != null && existing > 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un producto con ese SKU"
            );
        }

        UUID actorId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE email = ?",
                UUID.class,
                actorEmail
        );

        UUID productId = UUID.randomUUID();

        jdbcTemplate.update(
                """
                INSERT INTO catalog_products (
                    id, sku, brand, model, storage_gb,
                    color, description, active
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
                """,
                productId,
                request.sku(),
                request.brand(),
                request.model(),
                request.storageGb(),
                request.color(),
                request.description()
        );

        jdbcTemplate.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, 'PRODUCT_CREATED', 'CATALOG_PRODUCT', ?,
                    jsonb_build_object('sku', CAST(? AS text))
                )
                """,
                actorId,
                productId,
                request.sku()
        );

        return productId;
    }
}