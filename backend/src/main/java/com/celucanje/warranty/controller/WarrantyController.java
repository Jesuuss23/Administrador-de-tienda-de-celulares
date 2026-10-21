package com.celucanje.warranty.controller;

import com.celucanje.warranty.dto.WarrantyDtos;
import com.celucanje.warranty.service.WarrantyQueryService;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class WarrantyController {

    private final WarrantyQueryService service;

    public WarrantyController(WarrantyQueryService service) {
        this.service = service;
    }

    @GetMapping("/{orderId}/warranties")
    public List<WarrantyDtos.Item> getForCustomer(
            @PathVariable UUID orderId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                orderId
        );
    }
}