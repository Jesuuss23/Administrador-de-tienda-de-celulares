package com.celucanje.catalog.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AdminProductPage(
        List<Item> items,
        int page,
        int size,
        long total
) {

    public record Item(
            UUID id,
            String sku,
            String brand,
            String model,
            int storageGb,
            String color,
            boolean active,
            Instant createdAt
    ) {
    }
}