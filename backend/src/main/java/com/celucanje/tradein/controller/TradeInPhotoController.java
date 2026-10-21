package com.celucanje.tradein.controller;

import com.celucanje.tradein.dto.TradeInPhotoDtos;
import com.celucanje.tradein.service.TradeInPhotoService;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/trade-ins/{tradeInId}/photos")
public class TradeInPhotoController {

    private final TradeInPhotoService service;

    public TradeInPhotoController(TradeInPhotoService service) {
        this.service = service;
    }

    @GetMapping
    public List<TradeInPhotoDtos.Item> getMine(
            @PathVariable UUID tradeInId,
            Principal principal
    ) {
        return service.getMine(
                principal.getName(),
                tradeInId
        );
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TradeInPhotoDtos.Item upload(
            @PathVariable UUID tradeInId,
            @RequestParam("angle") TradeInPhotoDtos.Angle angle,
            @RequestParam("file") MultipartFile file,
            Principal principal
    ) {
        return service.upload(
                principal.getName(),
                tradeInId,
                angle,
                file
        );
    }

    @GetMapping("/{photoId}/content")
    public ResponseEntity<byte[]> getContent(
            @PathVariable UUID tradeInId,
            @PathVariable UUID photoId,
            Principal principal
    ) {
        byte[] content = service.getContent(
                principal.getName(),
                tradeInId,
                photoId
        );

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(content);
    }
}