package com.celucanje.cart.controller;

import com.celucanje.cart.dto.CartDtos;
import com.celucanje.cart.service.CartService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public CartDtos.Response getCart(Principal principal) {
        return cartService.getCart(principal.getName());
    }

    @PostMapping("/items")
    public CartDtos.Response addItem(
            @Valid @RequestBody CartDtos.AddItemRequest request,
            Principal principal
    ) {
        return cartService.addItem(
                principal.getName(),
                request.unitId()
        );
    }

    @DeleteMapping("/items/{unitId}")
    public CartDtos.Response removeItem(
            @PathVariable UUID unitId,
            Principal principal
    ) {
        return cartService.removeItem(
                principal.getName(),
                unitId
        );
    }
}