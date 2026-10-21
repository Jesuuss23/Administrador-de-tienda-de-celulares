package com.celucanje.demand.controller;

import com.celucanje.demand.service.SearchDemandService;
import com.celucanje.demand.service.SearchDemandService.Report;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/demand/searches")
public class AdminSearchDemandController {

    private final SearchDemandService service;

    public AdminSearchDemandController(SearchDemandService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Report> report(
            @RequestParam(defaultValue = "30") int days
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.report(days));
    }
}