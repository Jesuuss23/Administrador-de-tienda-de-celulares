package com.celucanje.fulfillment.controller;

import com.celucanje.fulfillment.dto.FulfillmentDtos;
import com.celucanje.fulfillment.service.FulfillmentService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class FulfillmentController {

    private final FulfillmentService fulfillmentService;

    public FulfillmentController(FulfillmentService fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }

    @GetMapping("/admin/fulfillments")
    public List<FulfillmentDtos.AdminItem> getAdminOrders() {
        return fulfillmentService.getRecentPaidOrders();
    }

    @PostMapping("/admin/fulfillments/{orderId}")
    public FulfillmentDtos.ActionResponse update(
            @PathVariable UUID orderId,
            @Valid @RequestBody FulfillmentDtos.UpdateRequest request,
            Principal principal
    ) {
        fulfillmentService.update(
                orderId,
                request,
                principal.getName()
        );

        return new FulfillmentDtos.ActionResponse(
                "Estado de entrega actualizado"
        );
    }

    @GetMapping("/orders/{orderId}/fulfillment")
    public FulfillmentDtos.CustomerResponse getCustomerStatus(
            @PathVariable UUID orderId,
            Principal principal
    ) {
        return fulfillmentService.getForCustomer(
                principal.getName(),
                orderId
        );
    }
}