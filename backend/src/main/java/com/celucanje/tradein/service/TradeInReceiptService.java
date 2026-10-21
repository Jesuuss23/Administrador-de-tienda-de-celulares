package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInReceiptDtos;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInReceiptService {

    private final JdbcTemplate jdbc;

    public TradeInReceiptService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public TradeInReceiptDtos.Item getForAdmin(UUID tradeInId) {
        return findReceipt(tradeInId);
    }

    @Transactional(readOnly = true)
    public TradeInReceiptDtos.Item getForCustomer(
            String email,
            UUID tradeInId
    ) {
        Boolean ownsRequest = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_requests t
                    JOIN users u ON u.id = t.customer_id
                    WHERE t.id = ?
                      AND u.email = ?
                      AND u.enabled = TRUE
                )
                """,
                Boolean.class,
                tradeInId,
                email
        );

        if (!Boolean.TRUE.equals(ownsRequest)) {
            throw notFound("La solicitud no existe");
        }

        return findReceipt(tradeInId);
    }

    @Transactional
    public TradeInReceiptDtos.Item receive(
            UUID tradeInId,
            TradeInReceiptDtos.CreateRequest request,
            String actorEmail
    ) {
        List<RequestContext> requests = jdbc.query(
                """
                SELECT status, imei
                FROM trade_in_requests
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> new RequestContext(
                        rs.getString("status"),
                        rs.getString("imei")
                ),
                tradeInId
        );

        if (requests.isEmpty()) {
            throw notFound("La solicitud no existe");
        }

        List<UUID> actors = jdbc.query(
                """
                SELECT u.id
                FROM users u
                WHERE u.email = ?
                  AND u.enabled = TRUE
                  AND EXISTS (
                      SELECT 1
                      FROM user_roles ur
                      JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id
                        AND r.name = 'ADMIN'
                  )
                """,
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                actorEmail
        );

        if (actors.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tienes permisos para recibir equipos"
            );
        }

        UUID actorId = actors.getFirst();

        if (!Boolean.TRUE.equals(request.physicallyReceived())) {
            throw badRequest(
                    "Debes confirmar la recepción física del equipo"
            );
        }

        /*
         * Reintentar el mismo envío devuelve la recepción existente.
         * No crea otra recepción ni otro evento de auditoría.
         */
        List<ExistingReceipt> existing = jdbc.query(
                """
                SELECT
                    request_key,
                    received_imei,
                    receipt_reference,
                    reception_notes,
                    received_by
                FROM trade_in_receipts
                WHERE trade_in_id = ?
                """,
                (rs, rowNumber) -> new ExistingReceipt(
                        rs.getObject("request_key", UUID.class),
                        rs.getString("received_imei"),
                        rs.getString("receipt_reference"),
                        rs.getString("reception_notes"),
                        rs.getObject("received_by", UUID.class)
                ),
                tradeInId
        );

        if (!existing.isEmpty()) {
            ExistingReceipt previous = existing.getFirst();

            boolean sameAttempt =
                    previous.requestKey().equals(request.requestKey())
                    && previous.receivedBy().equals(actorId)
                    && previous.receivedImei().equals(
                            request.receivedImei()
                    )
                    && previous.receiptReference().equals(
                            request.receiptReference()
                    )
                    && previous.receptionNotes().equals(
                            request.receptionNotes()
                    );

            if (!sameAttempt) {
                throw conflict(
                        "Este equipo ya tiene una recepción registrada. "
                        + "Actualiza la información."
                );
            }

            return findReceipt(tradeInId);
        }

        RequestContext tradeIn = requests.getFirst();

        if (!"ACCEPTED".equals(tradeIn.status())) {
            throw conflict(
                    "Solo se pueden recibir equipos con cotización aceptada"
            );
        }

        Boolean acceptedQuote = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_quotes
                    WHERE trade_in_id = ?
                      AND status = 'ACCEPTED'
                      AND responded_at IS NOT NULL
                )
                """,
                Boolean.class,
                tradeInId
        );

        if (!Boolean.TRUE.equals(acceptedQuote)) {
            throw conflict(
                    "La solicitud no tiene una cotización aceptada"
            );
        }

        /*
         * La vigencia de la oferta se comprobó cuando el cliente
         * respondió. No se exige que siga vigente al recibir
         * un equipo cuya oferta fue aceptada a tiempo.
         */
        if (!tradeIn.imei().equals(request.receivedImei())) {
            throw conflict(
                    "El IMEI del equipo recibido no coincide "
                    + "con el registrado en la solicitud"
            );
        }

        jdbc.update(
                """
                INSERT INTO trade_in_receipts (
                    trade_in_id,
                    request_key,
                    received_imei,
                    receipt_reference,
                    reception_notes,
                    received_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                tradeInId,
                request.requestKey(),
                request.receivedImei(),
                request.receiptReference(),
                request.receptionNotes(),
                actorId
        );

        jdbc.update(
                """
                UPDATE trade_in_requests
                SET status = 'RECEIVED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                tradeInId
        );

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
                    'TRADE_IN_RECEIVED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'previousStatus', 'ACCEPTED',
                        'nextStatus', 'RECEIVED',
                        'physicallyReceived', true,
                        'imeiMatched', true
                    )
                )
                """,
                actorId,
                tradeInId
        );

        return findReceipt(tradeInId);
    }

    private TradeInReceiptDtos.Item findReceipt(UUID tradeInId) {
        List<TradeInReceiptDtos.Item> results = jdbc.query(
                """
                SELECT
                    r.trade_in_id,
                    r.received_imei,
                    r.receipt_reference,
                    r.reception_notes,
                    u.full_name AS received_by_name,
                    r.received_at
                FROM trade_in_receipts r
                JOIN users u ON u.id = r.received_by
                WHERE r.trade_in_id = ?
                """,
                (rs, rowNumber) -> new TradeInReceiptDtos.Item(
                        rs.getObject("trade_in_id", UUID.class),
                        rs.getString("received_imei"),
                        rs.getString("receipt_reference"),
                        rs.getString("reception_notes"),
                        rs.getString("received_by_name"),
                        rs.getTimestamp("received_at").toInstant()
                ),
                tradeInId
        );

        if (results.isEmpty()) {
            throw notFound(
                    "Todavía no se ha registrado la recepción"
            );
        }

        return results.getFirst();
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                message
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }

    private record RequestContext(
            String status,
            String imei
    ) {
    }

    private record ExistingReceipt(
            UUID requestKey,
            String receivedImei,
            String receiptReference,
            String receptionNotes,
            UUID receivedBy
    ) {
    }
}