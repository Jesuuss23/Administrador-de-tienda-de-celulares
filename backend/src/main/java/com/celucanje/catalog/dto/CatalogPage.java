package com.celucanje.catalog.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CatalogPage(
        List<Item> items,
        int page,
        int size,
        long total
) {

    public record Item(
            UUID id,
            String brand,
            String model,
            int storageGb,
            String color,
            String imageUrl,
            String condition,
            BigDecimal priceFrom,
            String currency,
            long availableUnits
    ) {
    }
}