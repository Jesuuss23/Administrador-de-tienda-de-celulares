package com.celucanje.catalog.controller;

import com.celucanje.catalog.dto.AdminProductPage;
import com.celucanje.catalog.dto.CreateProductRequest;
import com.celucanje.catalog.service.AdminProductService;

import jakarta.validation.Valid;

import java.security.Principal;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping("/api/v1/admin/products")
public class AdminProductController {

    private final AdminProductService productService;

    public AdminProductController(AdminProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public AdminProductPage getProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        if (page < 0 || size < 1 || size > 50) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Parámetros de paginación inválidos"
            );
        }

        return productService.findAll(page, size);
    }
    @GetMapping("/{productId}")
    public AdminProductPage.Item getProduct(
            @PathVariable("productId") UUID productId
    ) {
        return productService.findById(productId);
    }
    @PostMapping
    public ResponseEntity<CreatedProduct> createProduct(
            @Valid @RequestBody CreateProductRequest request,
            Principal principal
    ) {
        UUID id = productService.create(request, principal.getName());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(new CreatedProduct(id, "Producto creado como borrador"));
    }

    public record CreatedProduct(UUID id, String message) {
    }
}