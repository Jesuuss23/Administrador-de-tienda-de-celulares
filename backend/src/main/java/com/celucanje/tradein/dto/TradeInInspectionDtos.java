package com.celucanje.tradein.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class TradeInInspectionDtos {

    private TradeInInspectionDtos() {
    }

    public enum TestResult {
        PASS,
        FAIL,
        NOT_TESTED
    }

    public record CreateRequest(
            @NotNull
            UUID requestKey,

            @NotNull
            TestResult screenTest,

            @NotNull
            TestResult touchTest,

            @NotNull
            TestResult camerasTest,

            @NotNull
            TestResult audioTest,

            @NotNull
            TestResult chargingTest,

            @NotNull
            TestResult connectivityTest,

            @NotNull
            Boolean imeiMatches,

            @NotNull
            Boolean accountLocksRemoved,

            @NotNull
            Boolean conditionMatches,

            @NotBlank
            @Size(
                    min = 20,
                    max = 3000,
                    message = "Las observaciones deben tener entre 20 y 3000 caracteres"
            )
            String notes
    ) {
        public CreateRequest {
            notes = notes == null ? null : notes.trim();
        }
    }

    public record Item(
            UUID id,
            UUID tradeInId,
            TestResult screenTest,
            TestResult touchTest,
            TestResult camerasTest,
            TestResult audioTest,
            TestResult chargingTest,
            TestResult connectivityTest,
            boolean imeiMatches,
            boolean accountLocksRemoved,
            boolean conditionMatches,
            String notes,
            String result,
            String inspectedByName,
            Instant inspectedAt
    ) {
    }
}