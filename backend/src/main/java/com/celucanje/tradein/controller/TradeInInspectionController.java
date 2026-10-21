package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInInspectionDtos;
import com.celucanje.tradein.service.TradeInInspectionService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TradeInInspectionController {

    private final TradeInInspectionService service;

    public TradeInInspectionController(TradeInInspectionService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/admin/trade-ins/{tradeInId}/inspections")
    public List<TradeInInspectionDtos.Item> getForAdmin(
            @PathVariable UUID tradeInId
    ) {
        return service.getForAdmin(tradeInId);
    }

    @PostMapping("/api/v1/admin/trade-ins/{tradeInId}/inspections")
    public TradeInInspectionDtos.Item create(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody TradeInInspectionDtos.CreateRequest request,
            Principal principal
    ) {
        return service.create(
                tradeInId,
                request,
                principal.getName()
        );
    }

    @GetMapping("/api/v1/trade-ins/{tradeInId}/inspections")
    public List<TradeInInspectionDtos.Item> getForCustomer(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                tradeInId
        );
    }
}