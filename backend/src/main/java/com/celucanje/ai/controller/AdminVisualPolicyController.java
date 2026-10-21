package com.celucanje.ai.controller;

import com.celucanje.ai.dto.VisualPolicyDtos.Page;
import com.celucanje.ai.dto.VisualPolicyDtos.Policy;
import com.celucanje.ai.dto.VisualPolicyDtos.SaveRequest;
import com.celucanje.ai.service.VisualPolicyService;

import jakarta.validation.Valid;

import java.security.Principal;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/ai/visual-policies")
public class AdminVisualPolicyController {

    private final VisualPolicyService service;

    public AdminVisualPolicyController(VisualPolicyService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Page> getPolicies(Principal principal) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getPolicies(principal.getName()));
    }

    @PostMapping
    public ResponseEntity<Policy> save(
            @Valid @RequestBody SaveRequest request,
            Principal principal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(service.save(request, principal.getName()));
    }
}