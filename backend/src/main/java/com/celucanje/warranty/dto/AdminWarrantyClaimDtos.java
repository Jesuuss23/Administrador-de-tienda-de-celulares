package com.celucanje.warranty.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AdminWarrantyClaimDtos {

    private AdminWarrantyClaimDtos() {
    }

    public enum Status {
        RECEIVED,
        UNDER_REVIEW,
        ACCEPTED,
        REJECTED,
        RESOLVED
    }

    public record UpdateRequest(
            @NotNull
            Status expectedStatus,

            @NotNull
            Status nextStatus,

            @Size(max = 2000)
            String notes
    ) {
        public UpdateRequest {
            notes = notes == null ? null : notes.trim();
        }
    }

    public record Item(
            UUID id,
            UUID warrantyId,
            long orderNumber,
            String customerName,
            String customerEmail,
            String productName,
            String environment,
            String description,
            String status,
            String resolutionNotes,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record ActionResponse(String message) {
    }
}