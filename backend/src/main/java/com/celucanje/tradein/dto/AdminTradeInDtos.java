package com.celucanje.tradein.dto;

import java.time.Instant;
import java.util.UUID;

public final class AdminTradeInDtos {

    private AdminTradeInDtos() {
    }

    public record Item(
            UUID id,
            String customerName,
            String customerEmail,
            String brand,
            String model,
            int storageGb,
            String color,
            String imei,
            String conditionDescription,
            String functionalIssues,
            String status,
            int photoCount,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record ActionResponse(String message) {
    }
}