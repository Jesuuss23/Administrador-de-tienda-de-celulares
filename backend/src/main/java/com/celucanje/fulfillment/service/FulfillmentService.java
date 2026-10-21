package com.celucanje.fulfillment.service;

import com.celucanje.fulfillment.dto.FulfillmentDtos;

import java.util.List;
import java.util.UUID;
import com.celucanje.warranty.service.WarrantyIssuanceService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;


@Service
public class FulfillmentService {

    private final JdbcTemplate jdbc;
    private final WarrantyIssuanceService warrantyIssuanceService;

    public FulfillmentService(
            JdbcTemplate jdbc,
            WarrantyIssuanceService warrantyIssuanceService
    ) {
        this.jdbc = jdbc;
        this.warrantyIssuanceService = warrantyIssuanceService;
    }

    @Transactional(readOnly = true)
    public List<FulfillmentDtos.AdminItem> getRecentPaidOrders() {
        return jdbc.query(
                """
                SELECT
                    o.id,
                    o.order_number,
                    u.full_name,
                    u.email,
                    o.total_amount,
                    o.currency,
                    COALESCE(f.status, 'PENDING') AS fulfillment_status,
                    f.recipient_name,
                    f.delivery_reference,
                    f.delivered_at,
                    (
                        COALESCE(o.settlement_environment = 'TEST', FALSE)
                        OR EXISTS (
                            SELECT 1
                            FROM payment_attempts p
                            WHERE p.order_id = o.id
                              AND p.status = 'APPROVED'
                              AND p.environment = 'TEST'
                        )
                    ) AS test_payment
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                LEFT JOIN order_fulfillments f ON f.order_id = o.id
                WHERE o.status = 'PAID'
                ORDER BY o.created_at DESC, o.id
                LIMIT 50
                """,
                (rs, rowNumber) -> {
                    var deliveredAt = rs.getTimestamp("delivered_at");

                    return new FulfillmentDtos.AdminItem(
                            rs.getObject("id", UUID.class),
                            rs.getLong("order_number"),
                            rs.getString("full_name"),
                            rs.getString("email"),
                            rs.getBigDecimal("total_amount"),
                            rs.getString("currency"),
                            rs.getString("fulfillment_status"),
                            rs.getString("recipient_name"),
                            rs.getString("delivery_reference"),
                            deliveredAt == null ? null : deliveredAt.toInstant(),
                            rs.getBoolean("test_payment")
                    );
                }
        );
    }

    @Transactional(readOnly = true)
    public FulfillmentDtos.CustomerResponse getForCustomer(
            String email,
            UUID orderId
    ) {
        List<FulfillmentDtos.CustomerResponse> results = jdbc.query(
                """
                SELECT
                    o.id,
                    CASE
                        WHEN o.status <> 'PAID' THEN 'AWAITING_PAYMENT'
                        ELSE COALESCE(f.status, 'PENDING')
                    END AS fulfillment_status,
                    f.recipient_name,
                    f.delivered_at
                FROM sales_orders o
                JOIN users u ON u.id = o.user_id
                LEFT JOIN order_fulfillments f ON f.order_id = o.id
                WHERE o.id = ? AND u.email = ?
                """,
                (rs, rowNumber) -> {
                    var deliveredAt = rs.getTimestamp("delivered_at");

                    return new FulfillmentDtos.CustomerResponse(
                            rs.getObject("id", UUID.class),
                            rs.getString("fulfillment_status"),
                            rs.getString("recipient_name"),
                            deliveredAt == null ? null : deliveredAt.toInstant()
                    );
                },
                orderId,
                email
        );

        if (results.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El pedido no existe"
            );
        }

        return results.getFirst();
    }

    @Transactional
    public void update(
            UUID orderId,
            FulfillmentDtos.UpdateRequest request,
            String actorEmail
    ) {
        List<String> orderStates = jdbc.query(
                "SELECT status FROM sales_orders WHERE id = ? FOR UPDATE",
                (rs, rowNumber) -> rs.getString("status"),
                orderId
        );

        if (orderStates.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El pedido no existe"
            );
        }

        if (!"PAID".equals(orderStates.getFirst())) {
            throw conflict("Solo se pueden preparar pedidos pagados");
        }

        List<String> fulfillmentStates = jdbc.query(
                "SELECT status FROM order_fulfillments WHERE order_id = ?",
                (rs, rowNumber) -> rs.getString("status"),
                orderId
        );

        String previousStatus = fulfillmentStates.isEmpty()
                ? "PENDING"
                : fulfillmentStates.getFirst();

        UUID actorId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?",
                UUID.class,
                actorEmail
        );

        String nextStatus;

        switch (request.action()) {
            case PREPARE -> {
                requireState(previousStatus, "PENDING");

                jdbc.update(
                        """
                        INSERT INTO order_fulfillments (order_id, status)
                        VALUES (?, 'PREPARING')
                        """,
                        orderId
                );

                nextStatus = "PREPARING";
            }

            case READY -> {
                requireState(previousStatus, "PREPARING");

                jdbc.update(
                        """
                        UPDATE order_fulfillments
                        SET status = 'READY',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE order_id = ?
                        """,
                        orderId
                );

                nextStatus = "READY";
            }

            case DELIVER -> {
               requireState(previousStatus, "READY");

               if (!Boolean.TRUE.equals(request.confirmed())) {
                   throw badRequest("Debes confirmar la entrega");
               }

               String recipient = request.recipientName() == null
                       ? ""
                       : request.recipientName().trim();

               String reference = request.deliveryReference() == null
                       ? ""
                       : request.deliveryReference().trim();

               if (recipient.isBlank() || reference.isBlank()) {
                   throw badRequest(
                           "Registra el receptor y la referencia de entrega"
                   );
               }

               int updated = jdbc.update(
                       """
                       UPDATE order_fulfillments
                       SET status = 'DELIVERED',
                           recipient_name = ?,
                           delivery_reference = ?,
                           delivered_at = CURRENT_TIMESTAMP,
                           delivered_by = ?,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE order_id = ?
                         AND status = 'READY'
                       """,
                       recipient,
                       reference,
                       actorId,
                       orderId
               );

               if (updated != 1) {
                   throw conflict(
                           "El pedido cambió de estado. Actualiza la lista."
                   );
               }

               warrantyIssuanceService.issueForDeliveredOrder(
                       orderId,
                       actorId
               );

               nextStatus = "DELIVERED";
           }

            default -> throw badRequest("Acción no válida");
        }

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, 'FULFILLMENT_UPDATED', 'SALES_ORDER', ?,
                    jsonb_build_object(
                        'previousStatus', CAST(? AS text),
                        'nextStatus', CAST(? AS text)
                    )
                )
                """,
                actorId,
                orderId,
                previousStatus,
                nextStatus
        );
    }

    private void requireState(String current, String expected) {
        if (!expected.equals(current)) {
            throw conflict(
                    "El pedido cambió de estado. Actualiza la lista."
            );
        }
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}