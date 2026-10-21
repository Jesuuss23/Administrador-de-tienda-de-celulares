package com.celucanje.warranty.controller;

import com.celucanje.warranty.dto.WarrantyClaimDtos;
import com.celucanje.warranty.service.WarrantyClaimService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(
        "/api/v1/orders/{orderId}/warranties/{warrantyId}/claims"
)
public class WarrantyClaimController {

    private final WarrantyClaimService service;

    public WarrantyClaimController(WarrantyClaimService service) {
        this.service = service;
    }

    @GetMapping
    public List<WarrantyClaimDtos.Item> getForCustomer(
            @PathVariable UUID orderId,
            @PathVariable UUID warrantyId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                orderId,
                warrantyId
        );
    }

    @PostMapping
    public WarrantyClaimDtos.Item create(
            @PathVariable UUID orderId,
            @PathVariable UUID warrantyId,
            @Valid @RequestBody WarrantyClaimDtos.CreateRequest request,
            Principal principal
    ) {
        return service.create(
                principal.getName(),
                orderId,
                warrantyId,
                request
        );
    }
}