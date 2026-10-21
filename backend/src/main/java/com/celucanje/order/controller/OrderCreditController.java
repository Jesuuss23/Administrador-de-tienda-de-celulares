package com.celucanje.order.controller;

import com.celucanje.order.dto.OrderDtos;
import com.celucanje.order.service.OrderCreditService;
import com.celucanje.order.service.OrderService;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderCreditController {

    private final OrderCreditService credits;
    private final OrderService orders;

    public OrderCreditController(
            OrderCreditService credits,
            OrderService orders
    ) {
        this.credits = credits;
        this.orders = orders;
    }

    @GetMapping("/credit-balances")
    public List<OrderDtos.CreditBalance> getBalances(
            Principal principal
    ) {
        return credits.getBalances(
                authenticatedEmail(principal)
        );
    }

    @PostMapping("/{orderId}/cancel-pending")
    public OrderDtos.Response cancelPending(
            @PathVariable UUID orderId,
            Principal principal
    ) {
        return orders.cancelPending(
                authenticatedEmail(principal),
                orderId
        );
    }

    private String authenticatedEmail(Principal principal) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Debes iniciar sesión"
            );
        }

        return principal.getName();
    }
}