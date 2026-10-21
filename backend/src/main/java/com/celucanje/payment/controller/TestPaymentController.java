package com.celucanje.payment.controller;

import com.celucanje.payment.dto.PaymentDtos;
import com.celucanje.payment.service.TestPaymentService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/{orderId}/test-payments")
@ConditionalOnProperty(
        name = "app.payments.test-enabled",
        havingValue = "true"
)
public class TestPaymentController {

    private final TestPaymentService paymentService;

    public TestPaymentController(TestPaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping
    public List<PaymentDtos.Response> getAttempts(
            @PathVariable UUID orderId,
            Principal principal
    ) {
        return paymentService.getAttempts(
                principal.getName(),
                orderId
        );
    }

    @PostMapping
    public PaymentDtos.Response simulate(
            @PathVariable UUID orderId,
            @Valid @RequestBody PaymentDtos.TestPaymentRequest request,
            Principal principal
    ) {
        return paymentService.simulate(
                principal.getName(),
                orderId,
                request
        );
    }
}