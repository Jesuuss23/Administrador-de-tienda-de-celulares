package com.celucanje.tradein.dto;

import java.time.Instant;
import java.util.UUID;

public final class TradeInPhotoDtos {

    private TradeInPhotoDtos() {
    }

    public enum Angle {
        FRONT,
        BACK,
        LEFT,
        RIGHT
    }

    public record Item(
            UUID id,
            Angle angle,
            int width,
            int height,
            Instant updatedAt,
            String imageUrl
    ) {
    }
}