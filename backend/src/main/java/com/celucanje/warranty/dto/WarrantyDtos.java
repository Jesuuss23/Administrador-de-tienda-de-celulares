package com.celucanje.warranty.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class WarrantyDtos {

    private WarrantyDtos() {
    }

    public record Identifier(
            String type,
            String value
    ) {
    }

    public record Item(
            UUID id,
            UUID unitId,
            String productName,
            String policyName,
            int durationDays,
            String coverage,
            String exclusions,
            String environment,
            Instant startsAt,
            Instant endsAt,
            String status,
            String voidReason,
            List<Identifier> identifiers
    ) {
    }
}