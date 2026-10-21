package com.celucanje.inventory.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public final class InventoryDtos {

    private InventoryDtos() {
    }

    public record CreateUnitRequest(

            @NotBlank(message = "El código interno es obligatorio")
            @Size(max = 60, message = "El código admite hasta 60 caracteres")
            @Pattern(
                    regexp = "[A-Z0-9_-]+",
                    message = "El código solo admite letras, números y guiones"
            )
            String internalCode,

            @NotBlank(message = "La condición es obligatoria")
            @Pattern(
                    regexp = "NEW|USED|REFURBISHED",
                    message = "La condición indicada no es válida"
            )
            String condition,

            @NotNull(message = "El costo es obligatorio")
            @DecimalMin(value = "0.00", message = "El costo no puede ser negativo")
            @Digits(integer = 10, fraction = 2)
            BigDecimal acquisitionCost,

            @NotNull(message = "El precio es obligatorio")
            @DecimalMin(value = "0.01", message = "El precio debe ser mayor que cero")
            @Digits(integer = 10, fraction = 2)
            BigDecimal sellingPrice,

            @NotBlank(message = "El IMEI es obligatorio")
            @Pattern(
                    regexp = "[0-9]{15}",
                    message = "El IMEI debe contener 15 dígitos"
            )
            String imei,

            @Size(max = 2000, message = "Las observaciones son demasiado largas")
            String conditionNotes
    ) {

        public CreateUnitRequest {
            internalCode = internalCode == null
                    ? null
                    : internalCode.trim().toUpperCase(Locale.ROOT);

            condition = condition == null
                    ? null
                    : condition.trim().toUpperCase(Locale.ROOT);

            imei = imei == null ? null : imei.trim();

            conditionNotes = conditionNotes == null
                    ? null
                    : conditionNotes.trim();
        }
    }

    public record InspectionRequest(

            @NotNull(message = "Debes confirmar la revisión")
            @AssertTrue(message = "Debes confirmar la revisión")
            Boolean confirmed,

            @NotBlank(message = "Registra el resultado de la revisión")
            @Size(max = 2000, message = "La observación es demasiado larga")
            String notes
    ) {
    }

    public record PublicationRequest(
            @NotNull(message = "Indica el estado de publicación")
            Boolean active
    ) {
    }

    public record UnitResponse(
            UUID id,
            String internalCode,
            String condition,
            String status,
            BigDecimal acquisitionCost,
            BigDecimal sellingPrice,
            String currency,
            String imei,
            String conditionNotes,
            Instant createdAt
    ) {
    }

    public record ActionResponse(String message) {
    }
}