package com.celucanje.tradein.controller;

import com.celucanje.tradein.service.TradeInVisualAnalysisService;
import com.celucanje.tradein.service.TradeInVisualAnalysisService.Analysis;
import com.celucanje.tradein.service.TradeInVisualAnalysisService.EvidencePhoto;
import org.springframework.http.MediaType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.security.Principal;
import java.util.List;
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
@RequestMapping("/api/v1/admin/trade-ins/{tradeInId}/visual-analyses")
public class AdminTradeInVisualAnalysisController {

    private final TradeInVisualAnalysisService service;

    public AdminTradeInVisualAnalysisController(
            TradeInVisualAnalysisService service
    ) {
        this.service = service;
    }

    public record AnalyzeRequest(
            @NotNull(message = "La clave de solicitud es obligatoria")
            UUID requestKey
    ) {
    }

    @GetMapping
    public ResponseEntity<List<Analysis>> getHistory(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getHistory(tradeInId, principal.getName()));
    }

    @PostMapping
    public ResponseEntity<Analysis> analyze(
            @PathVariable UUID tradeInId,
            @Valid @RequestBody AnalyzeRequest request,
            Principal principal
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.analyze(
                        tradeInId,
                        request.requestKey(),
                        principal.getName()
                ));
    }
    
    @GetMapping("/{analysisId}/photos")
    public ResponseEntity<List<EvidencePhoto>> getPhotos(
            @PathVariable UUID tradeInId,
            @PathVariable UUID analysisId,
            Principal principal
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getEvidencePhotos(
                        tradeInId,
                        analysisId,
                        principal.getName()
                ));
    }

    @GetMapping("/{analysisId}/photos/{angle}/content")
    public ResponseEntity<byte[]> getPhotoContent(
            @PathVariable UUID tradeInId,
            @PathVariable UUID analysisId,
            @PathVariable String angle,
            Principal principal
    ) {
        var photo = service.getEvidenceContent(
                tradeInId,
                analysisId,
                angle,
                principal.getName()
        );

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .header("X-Content-Type-Options", "nosniff")
                .body(photo.bytes());
    }
}