package com.celucanje.catalog.controller;

import com.celucanje.catalog.dto.ProductDetailResponse;
import com.celucanje.catalog.service.ProductDetailService;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/products")
public class ProductDetailController {

    private final ProductDetailService productDetailService;

    public ProductDetailController(
            ProductDetailService productDetailService
    ) {
        this.productDetailService = productDetailService;
    }

    @GetMapping("/{productId}")
    public ProductDetailResponse getProduct(
            @PathVariable UUID productId
    ) {
        return productDetailService.findById(productId);
    }
}