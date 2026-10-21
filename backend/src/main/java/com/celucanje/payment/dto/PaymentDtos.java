package com.celucanje.payment.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class PaymentDtos {

    private PaymentDtos() {
    }

    public enum TestOutcome {
        APPROVED,
        DECLINED
    }

    public record TestPaymentRequest(
            @NotNull(message = "La clave de solicitud es obligatoria")
            UUID requestKey,

            @NotNull(message = "Selecciona el resultado de prueba")
            TestOutcome outcome
    ) {
    }

    public record Response(
            UUID id,
            UUID orderId,
            String environment,
            String status,
            BigDecimal amount,
            String currency,
            Instant createdAt
    ) {
    }
}