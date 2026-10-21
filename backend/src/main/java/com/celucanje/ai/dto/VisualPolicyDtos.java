package com.celucanje.ai.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class VisualPolicyDtos {

    private VisualPolicyDtos() {
    }

    public record Weights(
            @Min(1) @Max(100) int front,
            @Min(1) @Max(100) int back,
            @Min(1) @Max(100) int left,
            @Min(1) @Max(100) int right
    ) {
        @AssertTrue(message = "Los cuatro pesos deben sumar 100")
        public boolean isTotalValid() {
            return front + back + left + right == 100;
        }
    }

    public record SaveRequest(
            @NotNull(message = "La política de referencia es obligatoria")
            UUID expectedActiveId,

            @NotBlank(message = "El nombre es obligatorio")
            @Size(max = 120)
            String name,

            @NotBlank(message = "Las instrucciones son obligatorias")
            @Size(max = 20000)
            String instructions,

            @NotNull
            @Valid
            Weights weights
    ) {
        public SaveRequest {
            name = name == null ? null : name.trim();
            instructions = instructions == null
                    ? null
                    : instructions.trim();
        }
    }

    public record Criterion(
            String code,
            String label,
            int weight
    ) {
    }

    public record Policy(
            UUID id,
            String name,
            int version,
            String instructions,
            List<Criterion> criteria,
            boolean active,
            Instant createdAt
    ) {
    }

    public record Page(
            Policy active,
            List<Policy> history
    ) {
    }
}