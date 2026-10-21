package com.celucanje.system;

import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/status")
public class StatusController {

    @GetMapping
    public StatusResponse getStatus() {
        return new StatusResponse(
                "CELU-CANJE",
                "UP",
                "Backend operativo",
                Instant.now()
        );
    }

    public record StatusResponse(
            String application,
            String status,
            String message,
            Instant timestamp
    ) {
    }
}