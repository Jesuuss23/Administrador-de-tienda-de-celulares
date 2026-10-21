package com.celucanje.cart.service;

import com.celucanje.cart.dto.CartDtos;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CartService {

    private final JdbcTemplate jdbc;

    public CartService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public CartDtos.Response getCart(String email) {
        return readCart(email);
    }

    @Transactional
    public CartDtos.Response addItem(String email, UUID unitId) {
        UUID cartId = lockCart(email);

        Long available = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM inventory_units u
                JOIN catalog_products p ON p.id = u.product_id
                WHERE u.id = ?
                  AND u.status = 'AVAILABLE'
                  AND p.active = TRUE
                """,
                Long.class,
                unitId
        );

        if (available == null || available == 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Este equipo ya no está disponible"
            );
        }

        jdbc.update(
                """
                INSERT INTO cart_items (cart_id, unit_id)
                VALUES (?, ?)
                ON CONFLICT (cart_id, unit_id) DO NOTHING
                """,
                cartId,
                unitId
        );

        updateCartTimestamp(cartId);

        return readCart(email);
    }

    @Transactional
    public CartDtos.Response removeItem(String email, UUID unitId) {
        UUID cartId = lockCart(email);

        jdbc.update(
                "DELETE FROM cart_items WHERE cart_id = ? AND unit_id = ?",
                cartId,
                unitId
        );

        updateCartTimestamp(cartId);

        return readCart(email);
    }

    private UUID lockCart(String email) {
        List<UUID> users = jdbc.query(
                "SELECT id FROM users WHERE email = ? AND enabled = TRUE",
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                email
        );

        if (users.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "La cuenta no está disponible"
            );
        }

        UUID userId = users.getFirst();

        jdbc.update(
                """
                INSERT INTO carts (user_id)
                VALUES (?)
                ON CONFLICT (user_id) DO NOTHING
                """,
                userId
        );

        return jdbc.queryForObject(
                "SELECT id FROM carts WHERE user_id = ? FOR UPDATE",
                UUID.class,
                userId
        );
    }

    private void updateCartTimestamp(UUID cartId) {
        jdbc.update(
                """
                UPDATE carts
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                cartId
        );
    }

    private CartDtos.Response readCart(String email) {
        List<CartDtos.Item> items = jdbc.query(
                """
                SELECT
                    u.id AS unit_id,
                    p.id AS product_id,
                    p.brand,
                    p.model,
                    p.storage_gb,
                    p.color,
                    u.condition,
                    p.image_url,
                    u.selling_price,
                    u.currency,
                    (p.active AND u.status = 'AVAILABLE') AS available
                FROM carts c
                JOIN users owner ON owner.id = c.user_id
                JOIN cart_items ci ON ci.cart_id = c.id
                JOIN inventory_units u ON u.id = ci.unit_id
                JOIN catalog_products p ON p.id = u.product_id
                WHERE owner.email = ?
                ORDER BY ci.added_at, ci.unit_id
                """,
                (rs, rowNumber) -> new CartDtos.Item(
                        rs.getObject("unit_id", UUID.class),
                        rs.getObject("product_id", UUID.class),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("condition"),
                        rs.getString("image_url"),
                        rs.getBigDecimal("selling_price"),
                        rs.getString("currency"),
                        rs.getBoolean("available")
                ),
                email
        );

        BigDecimal subtotal = items.stream()
                .filter(CartDtos.Item::available)
                .map(CartDtos.Item::price)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        boolean hasUnavailableItems = items.stream()
                .anyMatch(item -> !item.available());

        return new CartDtos.Response(
                items,
                subtotal,
                "PEN",
                hasUnavailableItems
        );
    }
}