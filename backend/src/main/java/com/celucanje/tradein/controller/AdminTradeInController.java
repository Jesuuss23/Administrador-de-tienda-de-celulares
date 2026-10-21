package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.AdminTradeInDtos;
import com.celucanje.tradein.dto.TradeInPhotoDtos;
import com.celucanje.tradein.service.AdminTradeInService;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/trade-ins")
public class AdminTradeInController {

    private final AdminTradeInService service;

    public AdminTradeInController(AdminTradeInService service) {
        this.service = service;
    }

    @GetMapping
    public List<AdminTradeInDtos.Item> getRecent() {
        return service.getRecent();
    }

    @GetMapping("/{tradeInId}/photos")
    public List<TradeInPhotoDtos.Item> getPhotos(
            @PathVariable UUID tradeInId
    ) {
        return service.getPhotos(tradeInId);
    }

    @GetMapping("/{tradeInId}/photos/{photoId}/content")
    public ResponseEntity<byte[]> getPhotoContent(
            @PathVariable UUID tradeInId,
            @PathVariable UUID photoId
    ) {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(service.getPhotoContent(tradeInId, photoId));
    }

    @PostMapping("/{tradeInId}/review")
    public AdminTradeInDtos.ActionResponse startReview(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        service.startReview(
                tradeInId,
                principal.getName()
        );

        return new AdminTradeInDtos.ActionResponse(
                "La solicitud está en revisión"
        );
    }
}