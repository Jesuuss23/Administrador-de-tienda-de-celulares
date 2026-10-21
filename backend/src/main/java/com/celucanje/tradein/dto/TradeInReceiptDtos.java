package com.celucanje.tradein.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class TradeInReceiptDtos {

    private TradeInReceiptDtos() {
    }

    public record CreateRequest(
            @NotNull
            UUID requestKey,

            @NotBlank
            @Pattern(
                    regexp = "[0-9]{15}",
                    message = "El IMEI debe contener 15 dígitos"
            )
            String receivedImei,

            @NotBlank
            @Size(
                    min = 3,
                    max = 120,
                    message = "La referencia debe tener entre 3 y 120 caracteres"
            )
            String receiptReference,

            @NotBlank
            @Size(
                    min = 20,
                    max = 2000,
                    message = "Describe la recepción usando entre 20 y 2000 caracteres"
            )
            String receptionNotes,

            @NotNull
            @AssertTrue(
                    message = "Debes confirmar que recibiste físicamente el equipo"
            )
            Boolean physicallyReceived
    ) {
        public CreateRequest {
            receivedImei = trim(receivedImei);
            receiptReference = trim(receiptReference);
            receptionNotes = trim(receptionNotes);
        }
    }

    public record Item(
            UUID tradeInId,
            String receivedImei,
            String receiptReference,
            String receptionNotes,
            String receivedByName,
            Instant receivedAt
    ) {
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}