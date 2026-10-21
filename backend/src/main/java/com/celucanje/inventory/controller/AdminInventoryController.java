package com.celucanje.inventory.controller;

import com.celucanje.inventory.dto.InventoryDtos.ActionResponse;
import com.celucanje.inventory.dto.InventoryDtos.CreateUnitRequest;
import com.celucanje.inventory.dto.InventoryDtos.InspectionRequest;
import com.celucanje.inventory.dto.InventoryDtos.PublicationRequest;
import com.celucanje.inventory.dto.InventoryDtos.UnitResponse;
import com.celucanje.inventory.service.InventoryService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminInventoryController {

    private final InventoryService inventoryService;

    public AdminInventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/products/{productId}/units")
    public List<UnitResponse> getUnits(@PathVariable UUID productId) {
        return inventoryService.findUnits(productId);
    }
    @GetMapping("/products/{productId}/units/{unitId}")
    public UnitResponse getUnit(
            @PathVariable UUID productId,
            @PathVariable UUID unitId
    ) {
        return inventoryService.findUnit(productId, unitId);
    }
    @PostMapping("/products/{productId}/units")
    public ResponseEntity<Map<String, UUID>> createUnit(
            @PathVariable UUID productId,
            @Valid @RequestBody CreateUnitRequest request,
            Principal principal
    ) {
        UUID id = inventoryService.createUnit(
                productId,
                request,
                principal.getName()
        );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(Map.of("id", id));
    }

    @PostMapping("/units/{unitId}/approve-inspection")
    public ActionResponse approveInspection(
            @PathVariable UUID unitId,
            @Valid @RequestBody InspectionRequest request,
            Principal principal
    ) {
        inventoryService.approveInspection(
                unitId,
                request,
                principal.getName()
        );

        return new ActionResponse("Unidad disponible para la venta");
    }

    @PostMapping("/products/{productId}/publication")
    public ActionResponse setPublication(
            @PathVariable UUID productId,
            @Valid @RequestBody PublicationRequest request,
            Principal principal
    ) {
        inventoryService.setPublication(
                productId,
                request.active(),
                principal.getName()
        );

        return new ActionResponse(
                request.active() ? "Producto publicado" : "Producto retirado"
        );
    }
}