package com.celucanje.catalog.service;

import com.celucanje.catalog.dto.ProductDetailResponse;
import com.celucanje.catalog.dto.ProductDetailResponse.AvailableUnit;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductDetailService {

    private final JdbcTemplate jdbc;

    public ProductDetailService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public ProductDetailResponse findById(UUID productId) {

        List<ProductDetailResponse> products = jdbc.query(
                """
                SELECT
                    id, brand, model, storage_gb,
                    color, description, image_url
                FROM catalog_products
                WHERE id = ? AND active = TRUE
                """,
                (rs, rowNumber) -> new ProductDetailResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("description"),
                        rs.getString("image_url"),
                        List.of()
                ),
                productId
        );

        if (products.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El producto no existe o no está publicado"
            );
        }

        ProductDetailResponse product = products.getFirst();

        List<AvailableUnit> units = jdbc.query(
                """
                SELECT id, condition, selling_price, currency
                FROM inventory_units
                WHERE product_id = ?
                  AND status = 'AVAILABLE'
                ORDER BY selling_price, id
                """,
                (rs, rowNumber) -> new AvailableUnit(
                        rs.getObject("id", UUID.class),
                        rs.getString("condition"),
                        rs.getBigDecimal("selling_price"),
                        rs.getString("currency")
                ),
                productId
        );

        return new ProductDetailResponse(
                product.id(),
                product.brand(),
                product.model(),
                product.storageGb(),
                product.color(),
                product.description(),
                product.imageUrl(),
                units
        );
    }
}