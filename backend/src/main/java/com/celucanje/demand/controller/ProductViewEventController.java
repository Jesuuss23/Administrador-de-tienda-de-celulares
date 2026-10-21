package com.celucanje.demand.controller;

import com.celucanje.demand.service.ProductDemandService;
import com.celucanje.demand.service.ProductDemandService.Receipt;
import com.celucanje.demand.service.ProductDemandService.ViewRequest;

import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/catalog/product-view-events")
public class ProductViewEventController {

    private final ProductDemandService service;

    public ProductViewEventController(ProductDemandService service) {
        this.service = service;
    }

    @PostMapping
    public Receipt record(
            @Valid @RequestBody ViewRequest request,
            HttpSession session
    ) {
        synchronized (session) {
            long now = System.currentTimeMillis();

            Long started = (Long) session.getAttribute(
                    "catalog.views.window"
            );

            Integer count = (Integer) session.getAttribute(
                    "catalog.views.count"
            );

            if (started == null || now - started >= 60_000) {
                session.setAttribute("catalog.views.window", now);
                session.setAttribute("catalog.views.count", 1);
            } else {
                int current = count == null ? 0 : count;

                if (current >= 30) {
                    throw new ResponseStatusException(
                            HttpStatus.TOO_MANY_REQUESTS,
                            "Se alcanzó el límite temporal de eventos"
                    );
                }

                session.setAttribute(
                        "catalog.views.count",
                        current + 1
                );
            }
        }

        return service.record(request);
    }
}