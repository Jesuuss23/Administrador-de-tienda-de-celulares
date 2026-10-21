package com.celucanje.demand.controller;

import com.celucanje.demand.service.ProductDemandService;
import com.celucanje.demand.service.ProductDemandService.Report;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/demand/products")
public class AdminProductDemandController {

    private final ProductDemandService service;

    public AdminProductDemandController(ProductDemandService service) {
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