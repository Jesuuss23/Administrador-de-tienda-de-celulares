package com.celucanje.ai.dto;

import java.util.List;

public final class VisualAnalysisDtos {

    private VisualAnalysisDtos() {
    }

    public record AngleResult(
            String angle,
            boolean evaluable,
            int severity,
            String confidence,
            String observations
    ) {
    }

    public record Result(
            String provider,
            String requestedModel,
            String modelVersion,
            String summary,
            List<AngleResult> angles
    ) {
        public Result {
            angles = List.copyOf(angles);
        }
    }
}