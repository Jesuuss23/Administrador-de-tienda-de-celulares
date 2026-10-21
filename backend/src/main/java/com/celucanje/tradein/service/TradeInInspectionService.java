package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInInspectionDtos;
import com.celucanje.tradein.dto.TradeInInspectionDtos.TestResult;

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
public class TradeInInspectionService {

    private final JdbcTemplate jdbc;

    public TradeInInspectionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<TradeInInspectionDtos.Item> getForAdmin(UUID tradeInId) {
        requireRequest(tradeInId);
        return findHistory(tradeInId);
    }

    @Transactional(readOnly = true)
    public List<TradeInInspectionDtos.Item> getForCustomer(
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
            throw notFound();
        }

        return findHistory(tradeInId);
    }

    @Transactional
    public TradeInInspectionDtos.Item create(
            UUID tradeInId,
            TradeInInspectionDtos.CreateRequest request,
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
            throw notFound();
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
                    "No tienes permisos para registrar inspecciones"
            );
        }

        UUID actorId = actors.getFirst();

        List<ExistingInspection> existing = jdbc.query(
                """
                SELECT i.*, u.full_name AS inspected_by_name
                FROM trade_in_inspections i
                JOIN users u ON u.id = i.inspected_by
                WHERE i.trade_in_id = ?
                  AND i.request_key = ?
                """,
                (rs, rowNumber) -> new ExistingInspection(
                        rs.getObject("inspected_by", UUID.class),
                        mapItem(rs, rowNumber)
                ),
                tradeInId,
                request.requestKey()
        );

        if (!existing.isEmpty()) {
            ExistingInspection previous = existing.getFirst();

            if (!previous.actorId().equals(actorId)
                    || !sameContent(previous.item(), request)) {
                throw conflict(
                        "La clave de envío ya se utilizó con otros datos"
                );
            }

            return previous.item();
        }

        if (!"RECEIVED".equals(states.getFirst())) {
            throw conflict(
                    "Solo se pueden inspeccionar equipos recibidos"
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
            throw conflict(
                    "Debes registrar la recepción antes de inspeccionar"
            );
        }

        boolean matchesOffer =
                request.screenTest() == TestResult.PASS
                && request.touchTest() == TestResult.PASS
                && request.camerasTest() == TestResult.PASS
                && request.audioTest() == TestResult.PASS
                && request.chargingTest() == TestResult.PASS
                && request.connectivityTest() == TestResult.PASS
                && Boolean.TRUE.equals(request.imeiMatches())
                && Boolean.TRUE.equals(request.accountLocksRemoved())
                && Boolean.TRUE.equals(request.conditionMatches());

        String result = matchesOffer
                ? "MATCHES_OFFER"
                : "REQUIRES_REVIEW";

        UUID inspectionId = UUID.randomUUID();

        jdbc.update(
                """
                INSERT INTO trade_in_inspections (
                    id,
                    trade_in_id,
                    request_key,
                    screen_test,
                    touch_test,
                    cameras_test,
                    audio_test,
                    charging_test,
                    connectivity_test,
                    imei_matches,
                    account_locks_removed,
                    condition_matches,
                    notes,
                    result,
                    inspected_by,
                    inspected_at
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    clock_timestamp()
                )
                """,
                inspectionId,
                tradeInId,
                request.requestKey(),
                request.screenTest().name(),
                request.touchTest().name(),
                request.camerasTest().name(),
                request.audioTest().name(),
                request.chargingTest().name(),
                request.connectivityTest().name(),
                request.imeiMatches(),
                request.accountLocksRemoved(),
                request.conditionMatches(),
                request.notes(),
                result,
                actorId
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
                    'TRADE_IN_INSPECTED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'inspectionId', CAST(? AS text),
                        'result', CAST(? AS text)
                    )
                )
                """,
                actorId,
                tradeInId,
                inspectionId.toString(),
                result
        );

        return jdbc.queryForObject(
                """
                SELECT i.*, u.full_name AS inspected_by_name
                FROM trade_in_inspections i
                JOIN users u ON u.id = i.inspected_by
                WHERE i.id = ?
                """,
                this::mapItem,
                inspectionId
        );
    }

    private List<TradeInInspectionDtos.Item> findHistory(UUID tradeInId) {
        return jdbc.query(
                """
                SELECT i.*, u.full_name AS inspected_by_name
                FROM trade_in_inspections i
                JOIN users u ON u.id = i.inspected_by
                WHERE i.trade_in_id = ?
                ORDER BY i.inspected_at DESC, i.id DESC
                LIMIT 50
                """,
                this::mapItem,
                tradeInId
        );
    }

    private boolean sameContent(
            TradeInInspectionDtos.Item item,
            TradeInInspectionDtos.CreateRequest request
    ) {
        return item.screenTest() == request.screenTest()
                && item.touchTest() == request.touchTest()
                && item.camerasTest() == request.camerasTest()
                && item.audioTest() == request.audioTest()
                && item.chargingTest() == request.chargingTest()
                && item.connectivityTest() == request.connectivityTest()
                && item.imeiMatches() == request.imeiMatches()
                && item.accountLocksRemoved() == request.accountLocksRemoved()
                && item.conditionMatches() == request.conditionMatches()
                && item.notes().equals(request.notes());
    }

    private TradeInInspectionDtos.Item mapItem(
            ResultSet rs,
            int rowNumber
    ) throws SQLException {
        return new TradeInInspectionDtos.Item(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_in_id", UUID.class),
                TestResult.valueOf(rs.getString("screen_test")),
                TestResult.valueOf(rs.getString("touch_test")),
                TestResult.valueOf(rs.getString("cameras_test")),
                TestResult.valueOf(rs.getString("audio_test")),
                TestResult.valueOf(rs.getString("charging_test")),
                TestResult.valueOf(rs.getString("connectivity_test")),
                rs.getBoolean("imei_matches"),
                rs.getBoolean("account_locks_removed"),
                rs.getBoolean("condition_matches"),
                rs.getString("notes"),
                rs.getString("result"),
                rs.getString("inspected_by_name"),
                rs.getTimestamp("inspected_at").toInstant()
        );
    }

    private void requireRequest(UUID tradeInId) {
        Boolean exists = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_requests
                    WHERE id = ?
                )
                """,
                Boolean.class,
                tradeInId
        );

        if (!Boolean.TRUE.equals(exists)) {
            throw notFound();
        }
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "La solicitud no existe"
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }

    private record ExistingInspection(
            UUID actorId,
            TradeInInspectionDtos.Item item
    ) {
    }
}