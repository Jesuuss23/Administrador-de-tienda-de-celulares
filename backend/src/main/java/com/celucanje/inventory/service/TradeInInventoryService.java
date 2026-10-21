package com.celucanje.inventory.service;

import com.celucanje.inventory.dto.InventoryDtos.CreateUnitRequest;
import com.celucanje.inventory.dto.TradeInInventoryDtos;

import jakarta.validation.Validator;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.Collections;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInInventoryService {

    private final JdbcTemplate jdbc;
    private final InventoryService inventory;
    private final Validator validator;

    public TradeInInventoryService(
            JdbcTemplate jdbc,
            InventoryService inventory,
            Validator validator
    ) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.validator = validator;
    }

    private record TradeIn(
            String status,
            String imei,
            String brand,
            String model,
            int storageGb,
            String color
    ) {
    }

    private record ExistingUnit(
            UUID id,
            UUID productId,
            String internalCode,
            BigDecimal sellingPrice,
            String conditionNotes,
            String status
    ) {
    }

    private record Credit(
            BigDecimal amount,
            String currency,
            String status
    ) {
    }

    @Transactional
    public TradeInInventoryDtos.Response createFromTradeIn(
            UUID tradeInId,
            TradeInInventoryDtos.CreateRequest request,
            String actorEmail
    ) {
        /*
         * Bloquear el canje serializa dos solicitudes de ingreso
         * que intenten registrar el mismo equipo.
         */
        List<TradeIn> tradeIns = jdbc.query(
                """
                SELECT
                    status,
                    imei,
                    brand,
                    model,
                    storage_gb,
                    color
                FROM trade_in_requests
                WHERE id = ?
                FOR UPDATE
                """,
                (rs, rowNumber) -> new TradeIn(
                        rs.getString("status"),
                        rs.getString("imei"),
                        rs.getString("brand"),
                        rs.getString("model"),
                        rs.getInt("storage_gb"),
                        rs.getString("color")
                ),
                tradeInId
        );

        if (tradeIns.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud de canje no existe"
            );
        }

        /*
         * Si este canje ya originó una unidad, un reintento
         * con los mismos datos devuelve esa unidad.
         */
        List<ExistingUnit> existingUnits = jdbc.query(
                """
                SELECT
                    id,
                    product_id,
                    internal_code,
                    selling_price,
                    condition_notes,
                    status
                FROM inventory_units
                WHERE source_trade_in_id = ?
                """,
                (rs, rowNumber) -> new ExistingUnit(
                        rs.getObject("id", UUID.class),
                        rs.getObject("product_id", UUID.class),
                        rs.getString("internal_code"),
                        rs.getBigDecimal("selling_price"),
                        rs.getString("condition_notes"),
                        rs.getString("status")
                ),
                tradeInId
        );

        if (!existingUnits.isEmpty()) {
            ExistingUnit existing = existingUnits.getFirst();

            boolean sameData =
                    existing.productId().equals(request.productId())
                    && existing.internalCode().equals(request.internalCode())
                    && existing.sellingPrice()
                            .compareTo(request.sellingPrice()) == 0
                    && Objects.equals(
                            existing.conditionNotes(),
                            request.conditionNotes()
                    );

            if (!sameData) {
                throw conflict(
                        "Este canje ya tiene una unidad registrada "
                        + "con otros datos. Revisa su inventario."
                );
            }

            return new TradeInInventoryDtos.Response(
                    existing.id(),
                    existing.productId(),
                    tradeInId,
                    existing.status(),
                    false
            );
        }

        TradeIn tradeIn = tradeIns.getFirst();

        if (!"CONFIRMED".equals(tradeIn.status())) {
            throw conflict(
                    "Solo puedes ingresar equipos de canjes confirmados"
            );
        }

        /*
         * Se bloquea el producto para que sus características
         * no cambien durante el ingreso.
         */
        List<Boolean> productMatches = jdbc.query(
                """
                SELECT
                    LOWER(BTRIM(brand)) = LOWER(BTRIM(?))
                    AND LOWER(BTRIM(model)) = LOWER(BTRIM(?))
                    AND storage_gb = ?
                    AND LOWER(BTRIM(color)) = LOWER(BTRIM(?))
                    AS matches_trade_in
                FROM catalog_products
                WHERE id = ?
                FOR SHARE
                """,
                (rs, rowNumber) ->
                        rs.getBoolean("matches_trade_in"),
                tradeIn.brand(),
                tradeIn.model(),
                tradeIn.storageGb(),
                tradeIn.color(),
                request.productId()
        );

        if (productMatches.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El producto del catálogo no existe"
            );
        }

        if (!Boolean.TRUE.equals(productMatches.getFirst())) {
            throw conflict(
                    "El producto debe coincidir con la marca, modelo, "
                    + "almacenamiento y color del canje."
            );
        }

        List<Credit> credits = jdbc.query(
                """
                SELECT amount, currency, status
                FROM trade_in_credits
                WHERE trade_in_id = ?
                FOR SHARE
                """,
                (rs, rowNumber) -> new Credit(
                        rs.getBigDecimal("amount"),
                        rs.getString("currency"),
                        rs.getString("status")
                ),
                tradeInId
        );

        if (credits.isEmpty()) {
            throw conflict(
                    "El canje todavía no tiene un crédito emitido"
            );
        }

        Credit credit = credits.getFirst();

        if ("VOID".equals(credit.status())) {
            throw conflict(
                    "El crédito de este canje está anulado"
            );
        }

        if (!"PEN".equals(credit.currency())) {
            throw conflict(
                    "La moneda del crédito no es compatible con el inventario"
            );
        }

        /*
         * Se utiliza el importe original del crédito como costo.
         * El saldo disponible del cliente no altera este costo.
         */
        CreateUnitRequest unitRequest = new CreateUnitRequest(
                request.internalCode(),
                "USED",
                credit.amount(),
                request.sellingPrice(),
                tradeIn.imei(),
                request.conditionNotes()
        );

        /*
         * Al construir el DTO dentro del servicio, ejecutamos
         * explícitamente sus validaciones.
         */
        var violations = validator.validate(unitRequest);

        if (!violations.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    violations.iterator().next().getMessage()
            );
        }

        /*
         * Reutiliza la creación existente:
         * validación de IMEI, identificador y auditoría.
         * Participa en esta misma transacción.
         */
        UUID unitId = inventory.createUnit(
                request.productId(),
                unitRequest,
                actorEmail
        );

        int linked = jdbc.update(
                """
                UPDATE inventory_units
                SET source_trade_in_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND source_trade_in_id IS NULL
                """,
                tradeInId,
                unitId
        );

        if (linked != 1) {
            throw conflict(
                    "No se pudo vincular la unidad con el canje"
            );
        }

        UUID actorId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?",
                UUID.class,
                actorEmail
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
                    'UNIT_CREATED_FROM_TRADE_IN',
                    'INVENTORY_UNIT',
                    ?,
                    jsonb_build_object(
                        'tradeInId', CAST(? AS text),
                        'productId', CAST(? AS text),
                        'acquisitionCost', CAST(? AS numeric),
                        'state', 'PENDING_INSPECTION'
                    )
                )
                """,
                actorId,
                unitId,
                tradeInId.toString(),
                request.productId().toString(),
                credit.amount()
        );

        return new TradeInInventoryDtos.Response(
                unitId,
                request.productId(),
                tradeInId,
                "PENDING_INSPECTION",
                true
        );
    }
    @Transactional(readOnly = true)
    public List<TradeInInventoryDtos.InventoryStatus> getInventoryStatuses(
            List<UUID> tradeInIds
    ) {
    if (tradeInIds == null
            || tradeInIds.isEmpty()
            || tradeInIds.size() > 100
            || tradeInIds.stream().anyMatch(Objects::isNull)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Consulta entre 1 y 100 identificadores de canje"
            );
        }

        List<UUID> ids = tradeInIds.stream().distinct().toList();

        String placeholders = String.join(
                ",",
                Collections.nCopies(ids.size(), "?")
        );

        String sql = """
                SELECT
                    t.id AS trade_in_id,
                    t.status AS trade_in_status,
                    c.amount AS confirmed_amount,
                    c.currency,
                    c.status AS credit_status,
                    u.id AS unit_id,
                    u.product_id,
                    u.internal_code,
                    u.status AS unit_status,
                    u.acquisition_cost
                FROM trade_in_requests t
                LEFT JOIN trade_in_credits c
                    ON c.trade_in_id = t.id
                LEFT JOIN inventory_units u
                    ON u.source_trade_in_id = t.id
                WHERE t.id IN (%s)
                ORDER BY t.id
                """.formatted(placeholders);

        return jdbc.query(
                sql,
                (rs, rowNumber) -> {
                    UUID unitId = rs.getObject("unit_id", UUID.class);
                    String tradeStatus = rs.getString("trade_in_status");
                    String creditStatus = rs.getString("credit_status");
                    String currency = rs.getString("currency");
                    BigDecimal amount = rs.getBigDecimal("confirmed_amount");

                    String reason;

                    if (unitId != null) {
                        reason = "El equipo ya ingresó al inventario.";
                    } else if (!"CONFIRMED".equals(tradeStatus)) {
                        reason = "El canje todavía no está confirmado.";
                    } else if (amount == null) {
                        reason = "El canje no tiene un crédito emitido.";
                    } else if ("VOID".equals(creditStatus)) {
                        reason = "El crédito del canje está anulado.";
                    } else if (!"PEN".equals(currency)) {
                        reason = "La moneda no es compatible con el inventario.";
                    } else {
                        reason = null;
                    }

                    return new TradeInInventoryDtos.InventoryStatus(
                            rs.getObject("trade_in_id", UUID.class),
                            amount,
                            currency,
                            creditStatus,
                            unitId,
                            rs.getObject("product_id", UUID.class),
                            rs.getString("internal_code"),
                            rs.getString("unit_status"),
                            rs.getBigDecimal("acquisition_cost"),
                            reason == null,
                            reason
                    );
                },
                ids.toArray()
        );
    }

    @Transactional(readOnly = true)
    public TradeInInventoryDtos.InventoryStatus getInventoryStatus(
            UUID tradeInId
    ) {
        List<TradeInInventoryDtos.InventoryStatus> results =
                getInventoryStatuses(List.of(tradeInId));

        if (results.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La solicitud de canje no existe"
            );
        }

        return results.getFirst();
    }
    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
                
        );
        
    }
}