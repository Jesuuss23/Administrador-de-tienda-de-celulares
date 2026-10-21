package com.celucanje.order.controller;

import com.celucanje.order.dto.OrderDtos;
import com.celucanje.order.service.OrderService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/checkout")
    public OrderDtos.Response checkout(
            @Valid @RequestBody OrderDtos.CheckoutRequest request,
            Principal principal
    ) {
        return orderService.checkout(principal.getName(), request);
    }

    @GetMapping("/{orderId}")
    public OrderDtos.Response getOrder(
            @PathVariable UUID orderId,
            Principal principal
    ) {
        return orderService.getOrder(principal.getName(), orderId);
    }
    @GetMapping
    public List<OrderDtos.Summary> getRecentOrders(Principal principal) {
        return orderService.getRecentOrders(principal.getName());
    }
}