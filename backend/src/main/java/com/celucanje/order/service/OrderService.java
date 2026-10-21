package com.celucanje.order.service;

import com.celucanje.order.dto.OrderDtos;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderService {

    private final JdbcTemplate jdbc;
    private final int reservationSeconds;
    private final OrderCreditService credits;
    private final OrderCompletionService completion;
    private final OrderReleaseService releases;

    public OrderService(
            JdbcTemplate jdbc,
            @Value("${app.reservations.duration-seconds:900}")
            int reservationSeconds,
            OrderCreditService credits,
            OrderCompletionService completion,
            OrderReleaseService releases
    ) {
        if (reservationSeconds < 30) {
            throw new IllegalArgumentException(
                    "La reserva debe durar al menos 30 segundos"
            );
        }

        this.jdbc = jdbc;
        this.reservationSeconds = reservationSeconds;
        this.credits = credits;
        this.completion = completion;
        this.releases = releases;
    }

    private record CartOwner(UUID cartId, UUID userId) {
    }

    private record Candidate(
            UUID unitId,
            String productName,
            int storageGb,
            String color,
            String condition,
            BigDecimal price
    ) {
    }

    @Transactional
    public OrderDtos.Response checkout(
            String email,
            OrderDtos.CheckoutRequest request
    ) {
        Set<UUID> requestedIds = new HashSet<>(request.unitIds());

        if (requestedIds.size() != request.unitIds().size()) {
            throw conflict(
                    "La solicitud contiene equipos duplicados"
            );
        }

        List<CartOwner> owners = jdbc.query(
                """
                SELECT
                    c.id AS cart_id,
                    u.id AS user_id
                FROM carts c
                JOIN users u ON u.id = c.user_id
                WHERE u.email = ?
                  AND u.enabled = TRUE
                FOR UPDATE OF c
                """,
                (rs, rowNumber) -> new CartOwner(
                        rs.getObject("cart_id", UUID.class),
                        rs.getObject("user_id", UUID.class)
                ),
                email
        );

        if (owners.isEmpty()) {
            throw conflict(
                    "No hay un carrito disponible para confirmar"
            );
        }

        CartOwner owner = owners.getFirst();

        /*
         * Se comprueba la clave antes de consultar el carrito.
         * Un reintento debe poder devolver el pedido ya creado,
         * aunque su carrito ya se haya vaciado.
         */
        List<UUID> previousOrders = jdbc.query(
                """
                SELECT id
                FROM sales_orders
                WHERE user_id = ?
                  AND request_key = ?
                """,
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                owner.userId(),
                request.requestKey()
        );

        if (!previousOrders.isEmpty()) {
            OrderDtos.Response previous = readOrder(
                    email,
                    previousOrders.getFirst()
            );

            Set<UUID> previousIds = new HashSet<>(
                    previous.items().stream()
                            .map(OrderDtos.Item::unitId)
                            .toList()
            );

            boolean sameRequest =
                    previousIds.equals(requestedIds)
                    && previous.totalAmount()
                            .compareTo(request.expectedSubtotal()) == 0
                    && Objects.equals(
                            previous.creditId(),
                            request.creditId()
                    )
                    && previous.creditApplied()
                            .compareTo(
                                    request.normalizedExpectedCredit()
                            ) == 0;

            if (!sameRequest) {
                throw conflict(
                        "La clave de solicitud ya fue utilizada con otros datos"
                );
            }

            return previous;
        }

        Long pendingOrders = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM sales_orders
                WHERE user_id = ?
                  AND status = 'PENDING_PAYMENT'
                """,
                Long.class,
                owner.userId()
        );

        if (pendingOrders != null && pendingOrders > 0) {
            throw conflict(
                    "Ya tienes un pedido pendiente de pago. "
                    + "Debes resolverlo antes de crear otro."
            );
        }

        List<UUID> cartIds = jdbc.query(
                """
                SELECT unit_id
                FROM cart_items
                WHERE cart_id = ?
                """,
                (rs, rowNumber) -> rs.getObject("unit_id", UUID.class),
                owner.cartId()
        );

        if (!new HashSet<>(cartIds).equals(requestedIds)) {
            throw conflict(
                    "El carrito cambió. Actualízalo antes de confirmar."
            );
        }

        List<Candidate> candidates = jdbc.query(
                """
                SELECT
                    u.id AS unit_id,
                    p.brand || ' ' || p.model AS product_name,
                    p.storage_gb,
                    p.color,
                    u.condition,
                    u.selling_price
                FROM cart_items ci
                JOIN inventory_units u ON u.id = ci.unit_id
                JOIN catalog_products p ON p.id = u.product_id
                WHERE ci.cart_id = ?
                  AND u.status = 'AVAILABLE'
                  AND p.active = TRUE
                ORDER BY p.id, u.id
                FOR UPDATE OF p, u
                """,
                (rs, rowNumber) -> new Candidate(
                        rs.getObject("unit_id", UUID.class),
                        rs.getString("product_name"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("condition"),
                        rs.getBigDecimal("selling_price")
                ),
                owner.cartId()
        );

        if (candidates.size() != requestedIds.size()) {
            throw conflict(
                    "Uno o más equipos ya no están disponibles. "
                    + "Actualiza tu carrito."
            );
        }

        BigDecimal total = candidates.stream()
                .map(Candidate::price)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (total.compareTo(request.expectedSubtotal()) != 0) {
            throw conflict(
                    "El precio del carrito cambió. "
                    + "Revisa el nuevo subtotal."
            );
        }

        UUID orderId = UUID.randomUUID();

        Instant databaseNow = jdbc.queryForObject(
                "SELECT clock_timestamp()",
                (rs, rowNumber) -> rs.getTimestamp(1).toInstant()
        );

        OffsetDateTime expiresAt = Objects.requireNonNull(databaseNow)
                .plusSeconds(reservationSeconds)
                .atOffset(ZoneOffset.UTC);

        jdbc.update(
                """
                INSERT INTO sales_orders (
                    id,
                    user_id,
                    request_key,
                    total_amount,
                    currency,
                    expires_at
                )
                VALUES (?, ?, ?, ?, 'PEN', ?)
                """,
                orderId,
                owner.userId(),
                request.requestKey(),
                total,
                expiresAt
        );

        for (Candidate candidate : candidates) {
            jdbc.update(
                    """
                    INSERT INTO sales_order_items (
                        order_id,
                        unit_id,
                        product_name,
                        storage_gb,
                        color,
                        condition,
                        unit_price
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    orderId,
                    candidate.unitId(),
                    candidate.productName(),
                    candidate.storageGb(),
                    candidate.color(),
                    candidate.condition(),
                    candidate.price()
            );

            jdbc.update(
                    """
                    INSERT INTO inventory_reservations (
                        order_id,
                        unit_id,
                        expires_at
                    )
                    VALUES (?, ?, ?)
                    """,
                    orderId,
                    candidate.unitId(),
                    expiresAt
            );

            int updated = jdbc.update(
                    """
                    UPDATE inventory_units
                    SET status = 'RESERVED',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND status = 'AVAILABLE'
                    """,
                    candidate.unitId()
            );

            if (updated != 1) {
                throw conflict(
                        "No se pudo reservar uno de los equipos"
                );
            }
        }

        /*
         * Reserva el crédito dentro de esta misma transacción.
         * Si falla, también se revierten el pedido y sus reservas.
         */
        credits.reserve(
                orderId,
                owner.userId(),
                request.creditId(),
                total,
                request.normalizedExpectedCredit()
        );

        jdbc.update(
                """
                DELETE FROM cart_items
                WHERE cart_id = ?
                """,
                owner.cartId()
        );

        jdbc.update(
                """
                UPDATE carts
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                owner.cartId()
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id,
                    action,
                    entity_type,
                    entity_id
                )
                VALUES (?, 'ORDER_CREATED', 'SALES_ORDER', ?)
                """,
                owner.userId(),
                orderId
        );

        BigDecimal amountDue = jdbc.queryForObject(
                """
                SELECT amount_due
                FROM sales_orders
                WHERE id = ?
                """,
                BigDecimal.class,
                orderId
        );

        /*
         * Si el crédito cubre todo, se completa la compra
         * sin insertar un intento de pago de importe cero.
         */
        if (amountDue != null && amountDue.signum() == 0) {
            completion.completeTest(
                    orderId,
                    owner.userId()
            );
        }

        return readOrder(email, orderId);
    }

    @Transactional(readOnly = true)
    public OrderDtos.Response getOrder(
            String email,
            UUID orderId
    ) {
        return readOrder(email, orderId);
    }

    @Transactional(readOnly = true)
    public List<OrderDtos.Summary> getRecentOrders(String email) {
        return jdbc.query(
                """
                SELECT o.*
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                WHERE u.email = ?
                ORDER BY o.created_at DESC, o.id
                LIMIT 20
                """,
                this::mapSummary,
                email
        );
    }

    @Transactional
    public OrderDtos.Response cancelPending(
            String email,
            UUID orderId
    ) {
        List<UUID> owners = jdbc.query(
                """
                SELECT o.user_id
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                FOR UPDATE OF o
                """,
                (rs, rowNumber) -> rs.getObject("user_id", UUID.class),
                orderId,
                email
        );

        if (owners.isEmpty()) {
            throw notFound();
        }

        releases.release(
                orderId,
                owners.getFirst(),
                "CANCELLED"
        );

        return readOrder(email, orderId);
    }

    private OrderDtos.Response readOrder(
            String email,
            UUID orderId
    ) {
        List<OrderDtos.Summary> orders = jdbc.query(
                """
                SELECT o.*
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.id = ?
                  AND u.email = ?
                """,
                this::mapSummary,
                orderId,
                email
        );

        if (orders.isEmpty()) {
            throw notFound();
        }

        List<OrderDtos.Item> items = jdbc.query(
                """
                SELECT
                    unit_id,
                    product_name,
                    storage_gb,
                    color,
                    condition,
                    unit_price
                FROM sales_order_items
                WHERE order_id = ?
                ORDER BY product_name, unit_id
                """,
                (rs, rowNumber) -> new OrderDtos.Item(
                        rs.getObject("unit_id", UUID.class),
                        rs.getString("product_name"),
                        rs.getInt("storage_gb"),
                        rs.getString("color"),
                        rs.getString("condition"),
                        rs.getBigDecimal("unit_price")
                ),
                orderId
        );

        OrderDtos.Summary order = orders.getFirst();

        return new OrderDtos.Response(
                order.id(),
                order.orderNumber(),
                order.status(),
                order.totalAmount(),
                order.currency(),
                order.expiresAt(),
                order.createdAt(),
                items,
                order.creditId(),
                order.creditApplied(),
                order.amountDue(),
                order.settlementEnvironment()
        );
    }

    private OrderDtos.Summary mapSummary(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        return new OrderDtos.Summary(
                rs.getObject("id", UUID.class),
                rs.getLong("order_number"),
                rs.getString("status"),
                rs.getBigDecimal("total_amount"),
                rs.getString("currency"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(),
                rs.getObject("trade_in_credit_id", UUID.class),
                rs.getBigDecimal("credit_applied"),
                rs.getBigDecimal("amount_due"),
                rs.getString("settlement_environment")
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "El pedido no existe"
        );
    }
}