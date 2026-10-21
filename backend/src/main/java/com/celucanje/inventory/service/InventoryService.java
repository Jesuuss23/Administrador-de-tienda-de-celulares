package com.celucanje.inventory.service;

import com.celucanje.inventory.dto.InventoryDtos.CreateUnitRequest;
import com.celucanje.inventory.dto.InventoryDtos.InspectionRequest;
import com.celucanje.inventory.dto.InventoryDtos.UnitResponse;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InventoryService {

    private final JdbcTemplate jdbc;

    public InventoryService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<UnitResponse> findUnits(UUID productId) {
        requireProduct(productId);

        return jdbc.query(
                """
                SELECT
                    u.id,
                    u.internal_code,
                    u.condition,
                    u.status,
                    u.acquisition_cost,
                    u.selling_price,
                    u.currency,
                    u.condition_notes,
                    u.created_at,
                    (
                        SELECT i.value
                        FROM unit_identifiers i
                        WHERE i.unit_id = u.id
                          AND i.identifier_type = 'IMEI'
                        ORDER BY i.id
                        LIMIT 1
                    ) AS imei
                FROM inventory_units u
                WHERE u.product_id = ?
                ORDER BY u.created_at DESC, u.id
                LIMIT 100
                """,
                (rs, rowNumber) -> new UnitResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("internal_code"),
                        rs.getString("condition"),
                        rs.getString("status"),
                        rs.getBigDecimal("acquisition_cost"),
                        rs.getBigDecimal("selling_price"),
                        rs.getString("currency"),
                        rs.getString("imei"),
                        rs.getString("condition_notes"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                productId
        );
    }

    @Transactional
    public UUID createUnit(
            UUID productId,
            CreateUnitRequest request,
            String actorEmail
    ) {
        requireProduct(productId);

        if (!isValidImei(request.imei())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El dígito de control del IMEI no es válido"
            );
        }

        Long duplicate = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM unit_identifiers
                WHERE identifier_type = 'IMEI' AND value = ?
                """,
                Long.class,
                request.imei()
        );

        if (duplicate != null && duplicate > 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ese IMEI ya está registrado. Revisa la unidad existente."
            );
        }

        UUID unitId = UUID.randomUUID();

        jdbc.update(
                """
                INSERT INTO inventory_units (
                    id, product_id, internal_code, condition, status,
                    acquisition_cost, selling_price, currency, condition_notes
                )
                VALUES (?, ?, ?, ?, 'PENDING_INSPECTION', ?, ?, 'PEN', ?)
                """,
                unitId,
                productId,
                request.internalCode(),
                request.condition(),
                request.acquisitionCost(),
                request.sellingPrice(),
                request.conditionNotes()
        );

        jdbc.update(
                """
                INSERT INTO unit_identifiers (
                    unit_id, identifier_type, value
                )
                VALUES (?, 'IMEI', ?)
                """,
                unitId,
                request.imei()
        );

        audit(
                actorEmail,
                "UNIT_CREATED",
                "INVENTORY_UNIT",
                unitId,
                "PENDING_INSPECTION",
                "Ingreso de unidad al inventario"
        );

        return unitId;
    }

    @Transactional
    public void approveInspection(
            UUID unitId,
            InspectionRequest request,
            String actorEmail
    ) {
        List<String> states = jdbc.query(
                "SELECT status FROM inventory_units WHERE id = ? FOR UPDATE",
                (rs, rowNumber) -> rs.getString("status"),
                unitId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "La unidad no existe"
            );
        }

        if (!"PENDING_INSPECTION".equals(states.getFirst())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo puedes aprobar unidades pendientes de inspección"
            );
        }

        Long identifiers = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM unit_identifiers
                WHERE unit_id = ? AND identifier_type = 'IMEI'
                """,
                Long.class,
                unitId
        );

        if (identifiers == null || identifiers == 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La unidad necesita un IMEI registrado"
            );
        }

        jdbc.update(
                """
                UPDATE inventory_units
                SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                unitId
        );

        audit(
                actorEmail,
                "UNIT_INSPECTION_APPROVED",
                "INVENTORY_UNIT",
                unitId,
                "AVAILABLE",
                request.notes().trim()
        );
    }

    @Transactional
    public void setPublication(
            UUID productId,
            boolean active,
            String actorEmail
    ) {
        List<Boolean> states = jdbc.query(
                "SELECT active FROM catalog_products WHERE id = ? FOR UPDATE",
                (rs, rowNumber) -> rs.getBoolean("active"),
                productId
        );

        if (states.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El producto no existe"
            );
        }

        if (states.getFirst() == active) {
            return;
        }

        jdbc.update(
                """
                UPDATE catalog_products
                SET active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                active,
                productId
        );

        audit(
                actorEmail,
                active ? "PRODUCT_PUBLISHED" : "PRODUCT_UNPUBLISHED",
                "CATALOG_PRODUCT",
                productId,
                active ? "PUBLISHED" : "DRAFT",
                "Cambio de publicación del producto"
        );
    }

    private void requireProduct(UUID productId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM catalog_products WHERE id = ?",
                Long.class,
                productId
        );

        if (count == null || count == 0) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "El producto no existe"
            );
        }
    }

    private void audit(
            String actorEmail,
            String action,
            String entityType,
            UUID entityId,
            String state,
            String notes
    ) {
        UUID actorId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?",
                UUID.class,
                actorEmail
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, ?, ?, ?,
                    jsonb_build_object(
                        'state', CAST(? AS text),
                        'notes', CAST(? AS text)
                    )
                )
                """,
                actorId,
                action,
                entityType,
                entityId,
                state,
                notes
        );
    }

    private boolean isValidImei(String imei) {
        if (imei == null || !imei.matches("[0-9]{15}")
                || imei.matches("0{15}")) {
            return false;
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

        return sum % 10 == 0;
    }
    
    @Transactional(readOnly = true)
    public com.celucanje.inventory.dto.InventoryDtos.UnitResponse findUnit(
            UUID productId,
            UUID unitId
    ) {
        var results = jdbc.query(
                """
                SELECT
                    u.id,
                    u.internal_code,
                    u.condition,
                    u.status,
                    u.acquisition_cost,
                    u.selling_price,
                    u.currency,
                    (
                        SELECT ui.value
                        FROM unit_identifiers ui
                        WHERE ui.unit_id = u.id
                          AND ui.identifier_type = 'IMEI'
                        ORDER BY ui.value
                        LIMIT 1
                    ) AS imei,
                    u.condition_notes,
                    u.created_at
                FROM inventory_units u
                WHERE u.product_id = ?
                  AND u.id = ?
                """,
                (rs, rowNumber) ->
                        new com.celucanje.inventory.dto.InventoryDtos.UnitResponse(
                                rs.getObject("id", UUID.class),
                                rs.getString("internal_code"),
                                rs.getString("condition"),
                                rs.getString("status"),
                                rs.getBigDecimal("acquisition_cost"),
                                rs.getBigDecimal("selling_price"),
                                rs.getString("currency"),
                                rs.getString("imei"),
                                rs.getString("condition_notes"),
                                rs.getTimestamp("created_at").toInstant()
                        ),
                productId,
                unitId
        );

        if (results.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND,
                    "La unidad no existe en el producto indicado"
            );
        }

        return results.getFirst();
    }
}