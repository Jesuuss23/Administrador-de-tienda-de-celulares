package com.celucanje.warranty.controller;

import com.celucanje.warranty.dto.AdminWarrantyClaimDtos;
import com.celucanje.warranty.service.AdminWarrantyClaimService;

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
@RequestMapping("/api/v1/admin/warranty-claims")
public class AdminWarrantyClaimController {

    private final AdminWarrantyClaimService service;

    public AdminWarrantyClaimController(
            AdminWarrantyClaimService service
    ) {
        this.service = service;
    }

    @GetMapping
    public List<AdminWarrantyClaimDtos.Item> getRecent() {
        return service.getRecent();
    }

    @PostMapping("/{claimId}/status")
    public AdminWarrantyClaimDtos.ActionResponse update(
            @PathVariable UUID claimId,
            @Valid @RequestBody
            AdminWarrantyClaimDtos.UpdateRequest request,
            Principal principal
    ) {
        service.update(
                claimId,
                request,
                principal.getName()
        );

        return new AdminWarrantyClaimDtos.ActionResponse(
                "Estado de la solicitud actualizado"
        );
    }
}