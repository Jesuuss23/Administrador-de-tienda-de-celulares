package com.celucanje.ai.service;

import com.celucanje.ai.dto.VisualPolicyDtos.Criterion;
import com.celucanje.ai.dto.VisualPolicyDtos.Page;
import com.celucanje.ai.dto.VisualPolicyDtos.Policy;
import com.celucanje.ai.dto.VisualPolicyDtos.SaveRequest;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class VisualPolicyService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public VisualPolicyService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public Page getPolicies(String email) {
        requireAdmin(email);

        List<Policy> active = jdbc.query(
                """
                SELECT id, name, version, instructions,
                       criteria, active, created_at
                FROM trade_in_visual_policies
                WHERE active = TRUE
                """,
                (rs, row) -> mapPolicy(rs)
        );

        List<Policy> history = jdbc.query(
                """
                SELECT id, name, version, instructions,
                       criteria, active, created_at
                FROM trade_in_visual_policies
                ORDER BY version DESC, created_at DESC, id
                LIMIT 50
                """,
                (rs, row) -> mapPolicy(rs)
        );

        return new Page(
                active.isEmpty() ? null : active.getFirst(),
                history
        );
    }

    @Transactional
    public Policy save(SaveRequest request, String email) {
        UUID actorId = requireAdmin(email);

        /*
         * Coordina la activación de versiones entre administradores.
         * La operación es corta y no llama a Gemini.
         */
        jdbc.execute(
                "LOCK TABLE trade_in_visual_policies "
                + "IN SHARE ROW EXCLUSIVE MODE"
        );

        List<UUID> active = jdbc.query(
                """
                SELECT id
                FROM trade_in_visual_policies
                WHERE active = TRUE
                """,
                (rs, row) -> rs.getObject("id", UUID.class)
        );

        if (active.size() != 1
                || !active.getFirst().equals(request.expectedActiveId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La política activa cambió. Recarga los criterios "
                    + "antes de guardar."
            );
        }

        Integer nextVersion = jdbc.queryForObject(
                """
                SELECT COALESCE(MAX(version), 0) + 1
                FROM trade_in_visual_policies
                """,
                Integer.class
        );

        var weights = request.weights();

        List<Criterion> criteria = List.of(
                new Criterion(
                        "FRONT",
                        "Estado exterior del frente",
                        weights.front()
                ),
                new Criterion(
                        "BACK",
                        "Estado exterior posterior",
                        weights.back()
                ),
                new Criterion(
                        "LEFT",
                        "Estado del lateral izquierdo",
                        weights.left()
                ),
                new Criterion(
                        "RIGHT",
                        "Estado del lateral derecho",
                        weights.right()
                )
        );

        UUID policyId = UUID.randomUUID();

        jdbc.update(
                """
                UPDATE trade_in_visual_policies
                SET active = FALSE
                WHERE id = ? AND active = TRUE
                """,
                request.expectedActiveId()
        );

        jdbc.update(
                """
                INSERT INTO trade_in_visual_policies (
                    id, name, version, instructions,
                    criteria, active, created_by
                )
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), TRUE, ?)
                """,
                policyId,
                request.name(),
                nextVersion,
                request.instructions(),
                mapper.writeValueAsString(criteria),
                actorId
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id, action, entity_type, entity_id, details
                )
                VALUES (
                    ?, 'VISUAL_POLICY_ACTIVATED', 'VISUAL_POLICY', ?,
                    jsonb_build_object(
                        'previousPolicyId', CAST(? AS text),
                        'version', CAST(? AS integer)
                    )
                )
                """,
                actorId,
                policyId,
                request.expectedActiveId().toString(),
                nextVersion
        );

        return jdbc.queryForObject(
                """
                SELECT id, name, version, instructions,
                       criteria, active, created_at
                FROM trade_in_visual_policies
                WHERE id = ?
                """,
                (rs, row) -> mapPolicy(rs),
                policyId
        );
    }

    private Policy mapPolicy(ResultSet rs) throws SQLException {
        JsonNode json = mapper.readTree(rs.getString("criteria"));
        List<Criterion> criteria = new ArrayList<>();

        for (JsonNode item : json) {
            criteria.add(new Criterion(
                    item.path("code").asText(),
                    item.path("label").asText(),
                    item.path("weight").asInt()
            ));
        }

        return new Policy(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getInt("version"),
                rs.getString("instructions"),
                List.copyOf(criteria),
                rs.getBoolean("active"),
                rs.getTimestamp("created_at").toInstant()
        );
    }

    private UUID requireAdmin(String email) {
        List<UUID> users = jdbc.query(
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
                (rs, row) -> rs.getObject("id", UUID.class),
                email
        );

        if (users.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Solo un administrador puede gestionar las políticas"
            );
        }

        return users.getFirst();
    }
}