package com.celucanje.tradein.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class TradeInDtos {

    private TradeInDtos() {
    }

    public record CreateRequest(
            @NotNull
            UUID requestKey,

            @NotBlank
            @Size(max = 80)
            String brand,

            @NotBlank
            @Size(max = 120)
            String model,

            @NotNull
            @Min(1)
            @Max(8192)
            Integer storageGb,

            @NotBlank
            @Size(max = 60)
            String color,

            @NotBlank
            @Pattern(
                    regexp = "[0-9]{15}",
                    message = "El IMEI debe tener exactamente 15 dígitos"
            )
            String imei,

            @NotBlank
            @Size(
                    min = 20,
                    max = 2000,
                    message = "Describe el estado físico usando entre 20 y 2000 caracteres"
            )
            String conditionDescription,

            @NotBlank
            @Size(
                    min = 2,
                    max = 2000,
                    message = "Indica las fallas conocidas o escribe Ninguna"
            )
            String functionalIssues
    ) {
        public CreateRequest {
            brand = trim(brand);
            model = trim(model);
            color = trim(color);
            imei = trim(imei);
            conditionDescription = trim(conditionDescription);
            functionalIssues = trim(functionalIssues);
        }
    }

    public record Item(
            UUID id,
            String brand,
            String model,
            int storageGb,
            String color,
            String imei,
            String conditionDescription,
            String functionalIssues,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}