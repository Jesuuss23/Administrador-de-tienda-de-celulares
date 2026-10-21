package com.celucanje.inventory.controller;

import com.celucanje.inventory.dto.TradeInInventoryDtos;
import com.celucanje.inventory.service.TradeInInventoryService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;


@RestController
@RequestMapping("/api/v1/admin/trade-ins")
public class AdminTradeInInventoryController {

    private final TradeInInventoryService inventory;

    public AdminTradeInInventoryController(
            TradeInInventoryService inventory
    ) {
        this.inventory = inventory;
    }
    @GetMapping("/inventory-status")
    public List<TradeInInventoryDtos.InventoryStatus> getStatuses(
            @RequestParam("ids") List<UUID> ids,
            Principal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Debes iniciar sesión"
            );
        }

        return inventory.getInventoryStatuses(ids);
    }

    @GetMapping("/{tradeInId}/inventory-status")
    public TradeInInventoryDtos.InventoryStatus getStatus(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Debes iniciar sesión"
            );
        }

        return inventory.getInventoryStatus(tradeInId);
    }
    @PostMapping("/{tradeInId}/inventory-unit")
    public ResponseEntity<TradeInInventoryDtos.Response> create(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody
            TradeInInventoryDtos.CreateRequest request,
            Principal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Debes iniciar sesión"
            );
        }

        try {
            TradeInInventoryDtos.Response response =
                    inventory.createFromTradeIn(
                            tradeInId,
                            request,
                            principal.getName()
                    );

            return ResponseEntity
                    .status(
                            response.created()
                                    ? HttpStatus.CREATED
                                    : HttpStatus.OK
                    )
                    .body(response);

        } catch (DuplicateKeyException exception) {
            /*
             * La transacción del servicio ya se revirtió.
             * También cubre duplicados detectados por la BD
             * si hubo solicitudes concurrentes.
             */
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El IMEI, el código interno o el canje ya están "
                    + "registrados. Revisa la unidad existente."
            );
        }
    }
}