package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInQuoteDtos;

import java.sql.ResultSet;
import java.sql.SQLException;

import java.time.Instant;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInQuoteService {

    private static final String QUOTE_CONDITIONS =
            "Oferta preliminar basada en los datos y fotografías enviados. "
            + "Está sujeta a inspección física y verificación del equipo. "
            + "Aceptar esta oferta no reserva otro celular ni genera un cobro. "
            + "Cualquier cambio posterior del importe requerirá "
            + "la aceptación expresa del cliente.";

    private final JdbcTemplate jdbc;

    public TradeInQuoteService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public TradeInQuoteDtos.Item getForCustomer(
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

        return findQuote(tradeInId);
    }

    @Transactional(readOnly = true)
    public TradeInQuoteDtos.Item getForAdmin(UUID tradeInId) {
        return findQuote(tradeInId);
    }

    @Transactional
    public TradeInQuoteDtos.Item create(
            UUID tradeInId,
            TradeInQuoteDtos.CreateRequest request,
            String actorEmail
    ) {
        List<String> states = jdbc.query(
                """
                SELECT status
                FROM trade_in_requests
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> rs.getString("status"),
                tradeInId
        );

        if (states.isEmpty()) {
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
                    "No tienes permisos para emitir cotizaciones"
            );
        }

        /*
         * Revisamos los reintentos antes de exigir UNDER_REVIEW.
         * El primer envío exitoso ya habrá cambiado a QUOTED.
         */
        List<ExistingQuote> existing = jdbc.query(
                """
                SELECT *
                FROM trade_in_quotes
                WHERE trade_in_id = ?
                """,
                (rs, rowNumber) -> new ExistingQuote(
                        rs.getObject("request_key", UUID.class),
                        rs.getObject("created_by", UUID.class),
                        mapItem(rs, rowNumber)
                ),
                tradeInId
        );

        if (!existing.isEmpty()) {
            ExistingQuote previous = existing.getFirst();
            TradeInQuoteDtos.Item quote = previous.item();

            boolean sameRequest =
                    previous.requestKey().equals(request.requestKey())
                    && previous.createdBy().equals(actors.getFirst())
                    && quote.offeredAmount().compareTo(
                            request.offeredAmount()
                    ) == 0
                    && quote.assessmentNotes().equals(
                            request.assessmentNotes()
                    )
                    && quote.validityDays() == request.validityDays();

            if (!sameRequest) {
                throw conflict(
                        "Esta solicitud ya tiene una cotización. "
                        + "Actualiza la bandeja para consultarla."
                );
            }

            return quote;
        }

        if (!"UNDER_REVIEW".equals(states.getFirst())) {
            throw conflict(
                    "Solo se pueden cotizar solicitudes en revisión"
            );
        }

        UUID quoteId = UUID.randomUUID();
        UUID actorId = actors.getFirst();

        jdbc.update(
                """
                INSERT INTO trade_in_quotes (
                    id,
                    trade_in_id,
                    request_key,
                    offered_amount,
                    assessment_notes,
                    conditions,
                    validity_days,
                    expires_at,
                    created_by,
                    created_at
                )
                SELECT
                    ?, ?, ?, ?, ?, ?, ?,
                    moment.issued_at
                        + CAST(? AS integer) * INTERVAL '24 hours',
                    ?,
                    moment.issued_at
                FROM (
                    SELECT clock_timestamp() AS issued_at
                ) moment
                """,
                quoteId,
                tradeInId,
                request.requestKey(),
                request.offeredAmount(),
                request.assessmentNotes(),
                QUOTE_CONDITIONS,
                request.validityDays(),
                request.validityDays(),
                actorId
        );

        jdbc.update(
                """
                UPDATE trade_in_requests
                SET status = 'QUOTED',
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
                    'TRADE_IN_QUOTED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'quoteId', CAST(? AS text),
                        'offeredAmount', CAST(? AS numeric),
                        'currency', 'PEN'
                    )
                )
                """,
                actorId,
                tradeInId,
                quoteId.toString(),
                request.offeredAmount()
        );

        return findQuote(tradeInId);
    }
@Transactional
public TradeInQuoteDtos.Item respond(
        String email,
        UUID tradeInId,
        TradeInQuoteDtos.RespondRequest request
) {
    /*
     * Mismo orden de bloqueo que la emisión:
     * primero solicitud y después cotización.
     */
    List<CustomerRequestContext> requests = jdbc.query(
            """
            SELECT t.status, t.customer_id
            FROM trade_in_requests t
            JOIN users u ON u.id = t.customer_id
            WHERE t.id = ?
              AND u.email = ?
              AND u.enabled = TRUE
            FOR UPDATE OF t
            """,
            (rs, rowNumber) -> new CustomerRequestContext(
                    rs.getString("status"),
                    rs.getObject("customer_id", UUID.class)
            ),
            tradeInId,
            email
    );

    if (requests.isEmpty()) {
        throw notFound("La solicitud no existe");
    }

    List<QuoteDecisionContext> quotes = jdbc.query(
            """
            SELECT id, status
            FROM trade_in_quotes
            WHERE trade_in_id = ?
            FOR UPDATE
            """,
            (rs, rowNumber) -> new QuoteDecisionContext(
                    rs.getObject("id", UUID.class),
                    rs.getString("status")
            ),
            tradeInId
    );

    if (quotes.isEmpty()) {
        throw notFound("Todavía no existe una cotización");
    }

    CustomerRequestContext customerRequest = requests.getFirst();
    QuoteDecisionContext quote = quotes.getFirst();

    if (!quote.id().equals(request.quoteId())) {
        throw conflict(
                "La cotización cambió. Actualiza la información."
        );
    }

    boolean accepting =
            request.decision() == TradeInQuoteDtos.Decision.ACCEPT;

    if (accepting
            && !Boolean.TRUE.equals(request.conditionsAccepted())) {
        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Debes aceptar las condiciones de la cotización"
        );
    }

    String nextQuoteStatus = accepting ? "ACCEPTED" : "DECLINED";
    String nextRequestStatus = accepting ? "ACCEPTED" : "CANCELLED";

    /*
     * Si el primer envío se guardó pero su respuesta se perdió,
     * repetir la misma decisión devuelve la cotización existente.
     */
    if (!"OFFERED".equals(quote.status())) {
        if (nextQuoteStatus.equals(quote.status())) {
            return findQuote(tradeInId);
        }

        throw conflict(
                "Esta cotización ya tiene una decisión registrada"
        );
    }

    if (!"QUOTED".equals(customerRequest.status())) {
        throw conflict(
                "La solicitud ya no permite responder esta cotización"
        );
    }

    /*
     * clock_timestamp() comprueba la hora real después de los bloqueos.
     * El UPDATE solo se realiza si la oferta sigue vigente.
     */
    int updated = jdbc.update(
            """
            UPDATE trade_in_quotes
            SET status = ?,
                responded_at = clock_timestamp()
            WHERE id = ?
              AND status = 'OFFERED'
              AND expires_at > clock_timestamp()
            """,
            nextQuoteStatus,
            quote.id()
    );

    if (updated != 1) {
        throw conflict(
                "La cotización ha vencido. Ya no puedes responderla."
        );
    }

    jdbc.update(
            """
            UPDATE trade_in_requests
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            nextRequestStatus,
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
                'TRADE_IN_QUOTE_RESPONDED',
                'TRADE_IN_REQUEST',
                ?,
                jsonb_build_object(
                    'quoteId', CAST(? AS text),
                    'decision', CAST(? AS text),
                    'conditionsAccepted', CAST(? AS boolean),
                    'nextStatus', CAST(? AS text)
                )
            )
            """,
            customerRequest.customerId(),
            tradeInId,
            quote.id().toString(),
            request.decision().name(),
            accepting,
            nextRequestStatus
    );

    return findQuote(tradeInId);
}
    private TradeInQuoteDtos.Item findQuote(UUID tradeInId) {
        List<TradeInQuoteDtos.Item> quotes = jdbc.query(
                """
                SELECT *
                FROM trade_in_quotes
                WHERE trade_in_id = ?
                """,
                this::mapItem,
                tradeInId
        );

        if (quotes.isEmpty()) {
            throw notFound("Todavía no existe una cotización");
        }

        return quotes.getFirst();
    }

    private TradeInQuoteDtos.Item mapItem(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        Instant expiresAt = rs.getTimestamp("expires_at").toInstant();
        String status = rs.getString("status");

        if ("OFFERED".equals(status)
                && !Instant.now().isBefore(expiresAt)) {
            status = "EXPIRED";
        }

        var respondedAt = rs.getTimestamp("responded_at");

        return new TradeInQuoteDtos.Item(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_in_id", UUID.class),
                rs.getBigDecimal("offered_amount"),
                rs.getString("currency"),
                rs.getString("assessment_notes"),
                rs.getString("conditions"),
                rs.getInt("validity_days"),
                expiresAt,
                status,
                rs.getTimestamp("created_at").toInstant(),
                respondedAt == null ? null : respondedAt.toInstant()
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

    private record ExistingQuote(
            UUID requestKey,
            UUID createdBy,
            TradeInQuoteDtos.Item item
    ) {
    }
    private record CustomerRequestContext(
        String status,
        UUID customerId
    ) {
    }

    private record QuoteDecisionContext(
            UUID id,
            String status
    ) {
    }
}