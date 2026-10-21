package com.celucanje.tradein.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class TradeInQuoteDtos {

    private TradeInQuoteDtos() {
    }

    public record CreateRequest(
            @NotNull
            UUID requestKey,

            @NotNull
            @DecimalMin("0.01")
            @Digits(integer = 10, fraction = 2)
            BigDecimal offeredAmount,

            @NotBlank
            @Size(
                    min = 20,
                    max = 3000,
                    message = "Las observaciones deben tener entre 20 y 3000 caracteres"
            )
            String assessmentNotes,

            @NotNull
            @Min(1)
            @Max(30)
            Integer validityDays
    ) {
        public CreateRequest {
            assessmentNotes = assessmentNotes == null
                    ? null
                    : assessmentNotes.trim();
        }
    }

    public record Item(
            UUID id,
            UUID tradeInId,
            BigDecimal offeredAmount,
            String currency,
            String assessmentNotes,
            String conditions,
            int validityDays,
            Instant expiresAt,
            String status,
            Instant createdAt,
            Instant respondedAt
    ) {
    }
    
    public enum Decision {
    ACCEPT,
    DECLINE
    }

    public record RespondRequest(
            @NotNull
            UUID quoteId,

            @NotNull
            Decision decision,

            Boolean conditionsAccepted
    ) {
    }
}