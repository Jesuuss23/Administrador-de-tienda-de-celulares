package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInQuoteDtos;
import com.celucanje.tradein.service.TradeInQuoteService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TradeInQuoteController {

    private final TradeInQuoteService service;

    public TradeInQuoteController(TradeInQuoteService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/trade-ins/{tradeInId}/quote")
    public TradeInQuoteDtos.Item getForCustomer(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                tradeInId
        );
    }

    @GetMapping("/api/v1/admin/trade-ins/{tradeInId}/quote")
    public TradeInQuoteDtos.Item getForAdmin(
            @PathVariable UUID tradeInId
    ) {
        return service.getForAdmin(tradeInId);
    }

    @PostMapping("/api/v1/admin/trade-ins/{tradeInId}/quote")
    public TradeInQuoteDtos.Item create(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody TradeInQuoteDtos.CreateRequest request,
            Principal principal
    ) {
        return service.create(
                tradeInId,
                request,
                principal.getName()
        );
    }
    @PostMapping("/api/v1/trade-ins/{tradeInId}/quote/response")
    public TradeInQuoteDtos.Item respond(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody TradeInQuoteDtos.RespondRequest request,
            Principal principal
    ) {
        return service.respond(
                principal.getName(),
                tradeInId,
                request
        );
    }
}