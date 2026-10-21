package com.celucanje.warranty.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class WarrantyClaimDtos {

    private WarrantyClaimDtos() {
    }

    public record CreateRequest(
            @NotNull(message = "La clave de solicitud es obligatoria")
            UUID requestKey,

            @NotBlank(message = "Describe la falla del equipo")
            @Size(
                    min = 20,
                    max = 2000,
                    message = "La descripción debe tener entre 20 y 2000 caracteres"
            )
            String description
    ) {
        public CreateRequest {
            description = description == null
                    ? null
                    : description.trim();
        }
    }

    public record Item(
            UUID id,
            UUID warrantyId,
            String description,
            String status,
            String resolutionNotes,
            Instant createdAt,
            Instant updatedAt,
            Instant resolvedAt
    ) {
    }
}