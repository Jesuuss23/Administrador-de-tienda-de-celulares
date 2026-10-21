package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInCreditDtos;
import com.celucanje.tradein.service.TradeInCreditService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TradeInCreditController {

    private final TradeInCreditService service;

    public TradeInCreditController(TradeInCreditService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/admin/trade-ins/{tradeInId}/credit")
    public TradeInCreditDtos.Item getForAdmin(
            @PathVariable UUID tradeInId
    ) {
        return service.getForAdmin(tradeInId);
    }

    @PostMapping("/api/v1/admin/trade-ins/{tradeInId}/credit")
    public TradeInCreditDtos.Item confirm(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody TradeInCreditDtos.ConfirmRequest request,
            Principal principal
    ) {
        return service.confirm(
                tradeInId,
                request,
                principal.getName()
        );
    }

    @GetMapping("/api/v1/trade-ins/{tradeInId}/credit")
    public TradeInCreditDtos.Item getForCustomer(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                tradeInId
        );
    }
}