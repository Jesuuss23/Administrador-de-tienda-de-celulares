package com.celucanje.cart.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class CartDtos {

    private CartDtos() {
    }

    public record AddItemRequest(
            @NotNull(message = "Selecciona una unidad")
            UUID unitId
    ) {
    }

    public record Item(
            UUID unitId,
            UUID productId,
            String brand,
            String model,
            int storageGb,
            String color,
            String condition,
            String imageUrl,
            BigDecimal price,
            String currency,
            boolean available
    ) {
    }

    public record Response(
            List<Item> items,
            BigDecimal availableSubtotal,
            String currency,
            boolean hasUnavailableItems
    ) {
    }
}