package com.celucanje.catalog.controller;

import com.celucanje.catalog.dto.CatalogPage;
import com.celucanje.catalog.service.CatalogService;

import java.util.Locale;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {

    private static final Set<String> CONDITIONS =
            Set.of("", "NEW", "USED", "REFURBISHED");

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/products")
    public CatalogPage getProducts(
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "") String condition,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size
    ) {
        String normalizedSearch = search.trim();
        String normalizedCondition =
                condition.trim().toUpperCase(Locale.ROOT);

        if (normalizedSearch.length() > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La búsqueda admite hasta 100 caracteres"
            );
        }

        if (!CONDITIONS.contains(normalizedCondition)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La condición indicada no es válida"
            );
        }

        if (page < 0 || size < 1 || size > 48) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La página debe ser positiva o cero y el tamaño entre 1 y 48"
            );
        }

        return catalogService.findProducts(
                normalizedSearch,
                normalizedCondition,
                page,
                size
        );
    }
}