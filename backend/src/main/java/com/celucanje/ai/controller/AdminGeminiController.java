package com.celucanje.ai.controller;

import com.celucanje.ai.service.GeminiConnectionService;
import com.celucanje.ai.service.GeminiConnectionService.ConnectionResponse;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/ai/gemini")
public class AdminGeminiController {

    private final GeminiConnectionService service;

    public AdminGeminiController(GeminiConnectionService service) {
        this.service = service;
    }

    @GetMapping("/connection")
    public ResponseEntity<ConnectionResponse> checkConnection() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.checkConnection());
    }
}