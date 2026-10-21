package com.celucanje.catalog.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ProductDetailResponse(
        UUID id,
        String brand,
        String model,
        int storageGb,
        String color,
        String description,
        String imageUrl,
        List<AvailableUnit> units
) {

    public record AvailableUnit(
            UUID id,
            String condition,
            BigDecimal sellingPrice,
            String currency
    ) {
    }
}