package com.celucanje.order.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    public record CheckoutRequest(
            @NotNull(message = "La clave de solicitud es obligatoria")
            UUID requestKey,

            @NotEmpty(message = "El carrito no puede estar vacío")
            @Size(max = 50, message = "Se permiten hasta 50 equipos por pedido")
            List<@NotNull UUID> unitIds,

            @NotNull(message = "El subtotal es obligatorio")
            @DecimalMin("0.01")
            @Digits(integer = 12, fraction = 2)
            BigDecimal expectedSubtotal,

            UUID creditId,

            @DecimalMin("0.00")
            @Digits(integer = 12, fraction = 2)
            BigDecimal expectedCreditApplied
    ) {
        public BigDecimal normalizedExpectedCredit() {
            return expectedCreditApplied == null
                    ? BigDecimal.ZERO
                    : expectedCreditApplied;
        }
    }

    public record Item(
            UUID unitId,
            String productName,
            int storageGb,
            String color,
            String condition,
            BigDecimal unitPrice
    ) {
    }

    public record Response(
            UUID id,
            long orderNumber,
            String status,
            BigDecimal totalAmount,
            String currency,
            Instant expiresAt,
            Instant createdAt,
            List<Item> items,
            UUID creditId,
            BigDecimal creditApplied,
            BigDecimal amountDue,
            String settlementEnvironment
    ) {
    }

    public record Summary(
            UUID id,
            long orderNumber,
            String status,
            BigDecimal totalAmount,
            String currency,
            Instant expiresAt,
            Instant createdAt,
            UUID creditId,
            BigDecimal creditApplied,
            BigDecimal amountDue,
            String settlementEnvironment
    ) {
    }

    public record CreditBalance(
            UUID id,
            BigDecimal amount,
            BigDecimal reservedAmount,
            BigDecimal usedAmount,
            BigDecimal availableAmount,
            String currency,
            String status
    ) {
    }
}