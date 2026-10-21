package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInReceiptDtos;
import com.celucanje.tradein.service.TradeInReceiptService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TradeInReceiptController {

    private final TradeInReceiptService service;

    public TradeInReceiptController(TradeInReceiptService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/admin/trade-ins/{tradeInId}/receipt")
    public TradeInReceiptDtos.Item getForAdmin(
            @PathVariable UUID tradeInId
    ) {
        return service.getForAdmin(tradeInId);
    }

    @PostMapping("/api/v1/admin/trade-ins/{tradeInId}/receipt")
    public TradeInReceiptDtos.Item receive(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody TradeInReceiptDtos.CreateRequest request,
            Principal principal
    ) {
        return service.receive(
                tradeInId,
                request,
                principal.getName()
        );
    }

    @GetMapping("/api/v1/trade-ins/{tradeInId}/receipt")
    public TradeInReceiptDtos.Item getForCustomer(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                tradeInId
        );
    }
}