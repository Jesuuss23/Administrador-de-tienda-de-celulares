package com.celucanje.fulfillment.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class FulfillmentDtos {

    private FulfillmentDtos() {
    }

    public enum Action {
        PREPARE,
        READY,
        DELIVER
    }

    public record UpdateRequest(
            @NotNull(message = "Selecciona una acción")
            Action action,

            @Size(max = 120, message = "El nombre admite hasta 120 caracteres")
            String recipientName,

            @Size(max = 200, message = "La referencia admite hasta 200 caracteres")
            String deliveryReference,

            Boolean confirmed
    ) {
    }

    public record AdminItem(
            UUID orderId,
            long orderNumber,
            String customerName,
            String customerEmail,
            BigDecimal totalAmount,
            String currency,
            String status,
            String recipientName,
            String deliveryReference,
            Instant deliveredAt,
            boolean testPayment
    ) {
    }

    public record CustomerResponse(
            UUID orderId,
            String status,
            String recipientName,
            Instant deliveredAt
    ) {
    }

    public record ActionResponse(String message) {
    }
}