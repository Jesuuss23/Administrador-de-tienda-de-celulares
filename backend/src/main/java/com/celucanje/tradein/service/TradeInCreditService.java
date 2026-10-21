package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInCreditDtos;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInCreditService {

    private final JdbcTemplate jdbc;

    public TradeInCreditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public TradeInCreditDtos.Item getForAdmin(UUID tradeInId) {
        return findCredit(tradeInId);
    }

    @Transactional(readOnly = true)
    public TradeInCreditDtos.Item getForCustomer(
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

        return findCredit(tradeInId);
    }

    @Transactional
    public TradeInCreditDtos.Item confirm(
            UUID tradeInId,
            TradeInCreditDtos.ConfirmRequest request,
            String actorEmail
    ) {
        List<RequestContext> requests = jdbc.query(
                """
                SELECT status, customer_id
                FROM trade_in_requests
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> new RequestContext(
                        rs.getString("status"),
                        rs.getObject("customer_id", UUID.class)
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
                    "No tienes permisos para confirmar canjes"
            );
        }

        UUID actorId = actors.getFirst();

        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Debes confirmar el cierre comercial del canje"
            );
        }

        List<ExistingCredit> existing = jdbc.query(
                """
                SELECT request_key, inspection_id, confirmed_by
                FROM trade_in_credits
                WHERE trade_in_id = ?
                """,
                (rs, rowNumber) -> new ExistingCredit(
                        rs.getObject("request_key", UUID.class),
                        rs.getObject("inspection_id", UUID.class),
                        rs.getObject("confirmed_by", UUID.class)
                ),
                tradeInId
        );

        if (!existing.isEmpty()) {
            ExistingCredit previous = existing.getFirst();

            if (!previous.requestKey().equals(request.requestKey())
                    || !previous.inspectionId().equals(
                            request.inspectionId()
                    )
                    || !previous.confirmedBy().equals(actorId)) {
                throw conflict(
                        "Este canje ya fue confirmado. Actualiza la información."
                );
            }

            return findCredit(tradeInId);
        }

        RequestContext tradeIn = requests.getFirst();

        if (!"RECEIVED".equals(tradeIn.status())) {
            throw conflict(
                    "Solo se pueden confirmar equipos recibidos e inspeccionados"
            );
        }

        Boolean hasReceipt = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_receipts
                    WHERE trade_in_id = ?
                )
                """,
                Boolean.class,
                tradeInId
        );

        if (!Boolean.TRUE.equals(hasReceipt)) {
            throw conflict("Falta registrar la recepción del equipo");
        }

        /*
         * Todas las nuevas inspecciones bloquean también la solicitud.
         * Mientras confirmamos, no puede registrarse otro informe.
         */
        List<InspectionContext> inspections = jdbc.query(
                """
                SELECT id, result
                FROM trade_in_inspections
                WHERE trade_in_id = ?
                ORDER BY inspected_at DESC, id DESC
                LIMIT 1
                """,
                (rs, rowNumber) -> new InspectionContext(
                        rs.getObject("id", UUID.class),
                        rs.getString("result")
                ),
                tradeInId
        );

        if (inspections.isEmpty()) {
            throw conflict("Falta registrar la inspección física");
        }

        InspectionContext inspection = inspections.getFirst();

        if (!inspection.id().equals(request.inspectionId())) {
            throw conflict(
                    "Existe una inspección más reciente. "
                    + "Actualiza y revisa su resultado."
            );
        }

        if (!"MATCHES_OFFER".equals(inspection.result())) {
            throw conflict(
                    "La inspección más reciente requiere revisión. "
                    + "No se puede confirmar el importe."
            );
        }

        List<QuoteContext> quotes = jdbc.query(
                """
                SELECT id, offered_amount, currency
                FROM trade_in_quotes
                WHERE trade_in_id = ?
                  AND status = 'ACCEPTED'
                  AND responded_at IS NOT NULL
                FOR UPDATE
                """,
                (rs, rowNumber) -> new QuoteContext(
                        rs.getObject("id", UUID.class),
                        rs.getBigDecimal("offered_amount"),
                        rs.getString("currency")
                ),
                tradeInId
        );

        if (quotes.isEmpty()) {
            throw conflict("No existe una cotización aceptada");
        }

        QuoteContext quote = quotes.getFirst();
        UUID creditId = UUID.randomUUID();

        jdbc.update(
                """
                INSERT INTO trade_in_credits (
                    id,
                    trade_in_id,
                    customer_id,
                    quote_id,
                    inspection_id,
                    request_key,
                    amount,
                    currency,
                    confirmed_by,
                    confirmed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, clock_timestamp())
                """,
                creditId,
                tradeInId,
                tradeIn.customerId(),
                quote.id(),
                inspection.id(),
                request.requestKey(),
                quote.amount(),
                quote.currency(),
                actorId
        );

        jdbc.update(
                """
                UPDATE trade_in_requests
                SET status = 'CONFIRMED',
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
                    'TRADE_IN_CONFIRMED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'creditId', CAST(? AS text),
                        'inspectionId', CAST(? AS text),
                        'amount', CAST(? AS numeric),
                        'currency', CAST(? AS text)
                    )
                )
                """,
                actorId,
                tradeInId,
                creditId.toString(),
                inspection.id().toString(),
                quote.amount(),
                quote.currency()
        );

        return findCredit(tradeInId);
    }

    private TradeInCreditDtos.Item findCredit(UUID tradeInId) {
        List<TradeInCreditDtos.Item> results = jdbc.query(
                """
                SELECT *
                FROM trade_in_credits
                WHERE trade_in_id = ?
                """,
                this::mapItem,
                tradeInId
        );

        if (results.isEmpty()) {
            throw notFound("Todavía no existe un crédito para este canje");
        }

        return results.getFirst();
    }

    private TradeInCreditDtos.Item mapItem(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        return new TradeInCreditDtos.Item(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_in_id", UUID.class),
                rs.getObject("inspection_id", UUID.class),
                rs.getBigDecimal("amount"),
                rs.getString("currency"),
                rs.getString("status"),
                rs.getTimestamp("confirmed_at").toInstant()
        );
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

    private record RequestContext(
            String status,
            UUID customerId
    ) {
    }

    private record InspectionContext(
            UUID id,
            String result
    ) {
    }

    private record QuoteContext(
            UUID id,
            BigDecimal amount,
            String currency
    ) {
    }

    private record ExistingCredit(
            UUID requestKey,
            UUID inspectionId,
            UUID confirmedBy
    ) {
    }
}