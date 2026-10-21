package com.celucanje.demand.controller;

import com.celucanje.demand.service.SearchDemandService;
import com.celucanje.demand.service.SearchDemandService.Receipt;
import com.celucanje.demand.service.SearchDemandService.SearchRequest;

import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/catalog/search-events")
public class SearchEventController {

    private static final String WINDOW =
            "catalog.search-events.window";

    private static final String COUNT =
            "catalog.search-events.count";

    private final SearchDemandService service;

    public SearchEventController(SearchDemandService service) {
        this.service = service;
    }

    @PostMapping
    public Receipt record(
            @Valid @RequestBody SearchRequest request,
            HttpSession session
    ) {
        checkSessionLimit(session);
        return service.record(request);
    }

    private void checkSessionLimit(HttpSession session) {
        synchronized (session) {
            long now = System.currentTimeMillis();

            Long window = (Long) session.getAttribute(WINDOW);
            Integer count = (Integer) session.getAttribute(COUNT);

            if (window == null || now - window >= 60_000) {
                session.setAttribute(WINDOW, now);
                session.setAttribute(COUNT, 1);
                return;
            }

            int current = count == null ? 0 : count;

            if (current >= 30) {
                throw new ResponseStatusException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "Se alcanzó el límite temporal de eventos"
                );
            }

            session.setAttribute(COUNT, current + 1);
        }
    }
}