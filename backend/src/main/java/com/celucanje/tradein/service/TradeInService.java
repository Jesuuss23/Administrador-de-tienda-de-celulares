package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInDtos;

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
public class TradeInService {

    private final JdbcTemplate jdbc;

    public TradeInService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<TradeInDtos.Item> getForCustomer(String email) {
        return jdbc.query(
                """
                SELECT t.*
                FROM trade_in_requests t
                JOIN users u ON u.id = t.customer_id
                WHERE u.email = ?
                  AND u.enabled = TRUE
                ORDER BY t.created_at DESC, t.id
                LIMIT 50
                """,
                this::mapItem,
                email
        );
    }

    @Transactional(readOnly = true)
    public TradeInDtos.Item getForCustomer(
            String email,
            UUID requestId
    ) {
        List<TradeInDtos.Item> results = jdbc.query(
                """
                SELECT t.*
                FROM trade_in_requests t
                JOIN users u ON u.id = t.customer_id
                WHERE t.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                """,
                this::mapItem,
                requestId,
                email
        );

        if (results.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud no existe"
            );
        }

        return results.getFirst();
    }

    @Transactional
    public TradeInDtos.Item create(
            String email,
            TradeInDtos.CreateRequest request
    ) {
        /*
         * Serializa los envíos del mismo cliente para que
         * dos reintentos simultáneos no creen solicitudes duplicadas.
         */
        List<UUID> users = jdbc.query(
                """
                SELECT id
                FROM users
                WHERE email = ?
                  AND enabled = TRUE
                FOR UPDATE
                """,
                (rs, rowNumber) -> rs.getObject("id", UUID.class),
                email
        );

        if (users.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La cuenta no está habilitada"
            );
        }

        UUID customerId = users.getFirst();

        List<TradeInDtos.Item> previous = jdbc.query(
                """
                SELECT *
                FROM trade_in_requests
                WHERE customer_id = ?
                  AND request_key = ?
                """,
                this::mapItem,
                customerId,
                request.requestKey()
        );

        if (!previous.isEmpty()) {
            TradeInDtos.Item existing = previous.getFirst();

            if (!sameContent(existing, request)) {
                throw conflict(
                        "La clave de envío ya se utilizó con otros datos"
                );
            }

            return existing;
        }

        validateImei(request.imei());

        /*
         * Los equipos que siguen bajo control de la tienda
         * no pueden presentarse como un nuevo canje.
         *
         * Un equipo vendido sí podría volver en un futuro canje.
         */
        Boolean storeHasDevice = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM unit_identifiers identifier
                    JOIN inventory_units unit
                        ON unit.id = identifier.unit_id
                    WHERE identifier.identifier_type = 'IMEI'
                      AND identifier.value = ?
                      AND unit.status <> 'SOLD'
                )
                """,
                Boolean.class,
                request.imei()
        );

        if (Boolean.TRUE.equals(storeHasDevice)) {
            throw conflict(
                    "No se puede registrar este equipo para canje. "
                    + "Contacta con la tienda para revisar el identificador."
            );
        }

        UUID requestId = UUID.randomUUID();

        /*
         * El índice único por IMEI también protege frente
         * a solicitudes simultáneas de clientes diferentes.
         */
        int inserted = jdbc.update(
                """
                INSERT INTO trade_in_requests (
                    id,
                    customer_id,
                    request_key,
                    brand,
                    model,
                    storage_gb,
                    color,
                    imei,
                    condition_description,
                    functional_issues
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                """,
                requestId,
                customerId,
                request.requestKey(),
                request.brand(),
                request.model(),
                request.storageGb(),
                request.color(),
                request.imei(),
                request.conditionDescription(),
                request.functionalIssues()
        );

        if (inserted != 1) {
            throw conflict(
                    "No se pudo registrar la solicitud: "
                    + "el equipo ya tiene una solicitud activa "
                    + "o el envío está duplicado."
            );
        }

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
                    'TRADE_IN_SUBMITTED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object('status', 'SUBMITTED')
                )
                """,
                customerId,
                requestId
        );

        return jdbc.queryForObject(
                """
                SELECT *
                FROM trade_in_requests
                WHERE id = ?
                """,
                this::mapItem,
                requestId
        );
    }

    private boolean sameContent(
            TradeInDtos.Item existing,
            TradeInDtos.CreateRequest request
    ) {
        return existing.brand().equals(request.brand())
                && existing.model().equals(request.model())
                && existing.storageGb() == request.storageGb()
                && existing.color().equals(request.color())
                && existing.imei().equals(request.imei())
                && existing.conditionDescription().equals(
                        request.conditionDescription()
                )
                && existing.functionalIssues().equals(
                        request.functionalIssues()
                );
    }

    private void validateImei(String imei) {
        if (imei == null
                || !imei.matches("[0-9]{15}")
                || "000000000000000".equals(imei)) {
            throw badRequest("El IMEI no es válido");
        }

        int sum = 0;

        for (int index = 0; index < imei.length(); index++) {
            int digit = imei.charAt(index) - '0';

            if (index % 2 == 1) {
                digit *= 2;

                if (digit > 9) {
                    digit -= 9;
                }
            }

            sum += digit;
        }

        if (sum % 10 != 0) {
            throw badRequest(
                    "El dígito de control del IMEI no es válido"
            );
        }
    }

    private TradeInDtos.Item mapItem(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        return new TradeInDtos.Item(
                rs.getObject("id", UUID.class),
                rs.getString("brand"),
                rs.getString("model"),
                rs.getInt("storage_gb"),
                rs.getString("color"),
                rs.getString("imei"),
                rs.getString("condition_description"),
                rs.getString("functional_issues"),
                rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
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
}