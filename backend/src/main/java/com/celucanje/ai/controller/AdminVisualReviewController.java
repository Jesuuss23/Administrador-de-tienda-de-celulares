package com.celucanje.ai.controller;

import com.celucanje.ai.service.VisualReviewService;
import com.celucanje.ai.service.VisualReviewService.Response;
import com.celucanje.ai.service.VisualReviewService.SaveRequest;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(
        "/api/v1/admin/trade-ins/{tradeInId}"
        + "/visual-analyses/{analysisId}/review"
)
public class AdminVisualReviewController {

    private final VisualReviewService service;

    public AdminVisualReviewController(VisualReviewService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Response> get(
            @PathVariable UUID tradeInId,
            @PathVariable UUID analysisId,
            Principal principal
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.get(
                        tradeInId,
                        analysisId,
                        principal.getName()
                ));
    }

    @PostMapping
    public ResponseEntity<Response> save(
            @PathVariable UUID tradeInId,
            @PathVariable UUID analysisId,
            @Valid @RequestBody SaveRequest request,
            Principal principal
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.save(
                        tradeInId,
                        analysisId,
                        request,
                        principal.getName()
                ));
    }
}