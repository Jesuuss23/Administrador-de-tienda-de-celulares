package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInDtos;
import com.celucanje.tradein.service.TradeInService;

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
@RequestMapping("/api/v1/trade-ins")
public class TradeInController {

    private final TradeInService service;

    public TradeInController(TradeInService service) {
        this.service = service;
    }

    @GetMapping
    public List<TradeInDtos.Item> getMine(Principal principal) {
        return service.getForCustomer(principal.getName());
    }

    @GetMapping("/{requestId}")
    public TradeInDtos.Item getOne(
            @PathVariable UUID requestId,
            Principal principal
    ) {
        return service.getForCustomer(
                principal.getName(),
                requestId
        );
    }

    @PostMapping
    public TradeInDtos.Item create(
            @Valid @RequestBody TradeInDtos.CreateRequest request,
            Principal principal
    ) {
        return service.create(
                principal.getName(),
                request
        );
    }
}