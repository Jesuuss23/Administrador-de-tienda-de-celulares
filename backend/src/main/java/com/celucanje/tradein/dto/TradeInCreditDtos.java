package com.celucanje.tradein.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class TradeInCreditDtos {

    private TradeInCreditDtos() {
    }

    public record ConfirmRequest(
            @NotNull
            UUID requestKey,

            @NotNull
            UUID inspectionId,

            @NotNull
            @AssertTrue(
                    message = "Debes confirmar el cierre comercial del canje"
            )
            Boolean confirmed
    ) {
    }

    public record Item(
            UUID id,
            UUID tradeInId,
            UUID inspectionId,
            BigDecimal amount,
            String currency,
            String status,
            Instant confirmedAt
    ) {
    }
}