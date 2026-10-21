package com.celucanje.order.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReservationExpirationJob {

    private final ReservationExpirationService expirationService;

    public ReservationExpirationJob(
            ReservationExpirationService expirationService
    ) {
        this.expirationService = expirationService;
    }

    @Scheduled(
            fixedDelayString = "${app.reservations.cleanup-delay-ms:15000}"
    )
    public void run() {
        expirationService.expireOrders();
    }
}