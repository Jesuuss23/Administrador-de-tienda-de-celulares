package com.celucanje.inventory.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

public final class TradeInInventoryDtos {

    private TradeInInventoryDtos() {
    }

    public record CreateRequest(
            @NotNull(message = "Selecciona el producto del catálogo")
            UUID productId,

            @NotBlank(message = "El código interno es obligatorio")
            @Size(max = 60, message = "El código admite hasta 60 caracteres")
            @Pattern(
                    regexp = "[A-Z0-9_-]+",
                    message = "El código solo admite letras, números y guiones"
            )
            String internalCode,

            @NotNull(message = "El precio de venta es obligatorio")
            @DecimalMin(
                    value = "0.01",
                    message = "El precio debe ser mayor que cero"
            )
            @Digits(integer = 10, fraction = 2)
            BigDecimal sellingPrice,

            @Size(
                    max = 2000,
                    message = "Las observaciones son demasiado largas"
            )
            String conditionNotes
    ) {
        public CreateRequest {
            internalCode = internalCode == null
                    ? null
                    : internalCode.trim().toUpperCase(Locale.ROOT);

            conditionNotes = conditionNotes == null
                    || conditionNotes.isBlank()
                    ? null
                    : conditionNotes.trim();
        }
    }

    public record Response(
            UUID unitId,
            UUID productId,
            UUID tradeInId,
            String status,
            boolean created
    ) {
    }
    public record InventoryStatus(
            UUID tradeInId,
            BigDecimal confirmedAmount,
            String currency,
            String creditStatus,
            UUID unitId,
            UUID productId,
            String internalCode,
            String unitStatus,
            BigDecimal acquisitionCost,
            boolean eligible,
            String reason
    ) {
    }
}