package com.celucanje.catalog.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Locale;

public record CreateProductRequest(

        @NotBlank(message = "El SKU es obligatorio")
        @Size(max = 60, message = "El SKU admite hasta 60 caracteres")
        @Pattern(
                regexp = "[A-Z0-9_-]+",
                message = "Usa letras, números, guiones o guiones bajos"
        )
        String sku,

        @NotBlank(message = "La marca es obligatoria")
        @Size(max = 80, message = "La marca admite hasta 80 caracteres")
        String brand,

        @NotBlank(message = "El modelo es obligatorio")
        @Size(max = 120, message = "El modelo admite hasta 120 caracteres")
        String model,

        @NotNull(message = "La capacidad es obligatoria")
        @Min(value = 1, message = "La capacidad debe ser mayor que cero")
        @Max(value = 8192, message = "La capacidad máxima es 8192 GB")
        Integer storageGb,

        @NotBlank(message = "El color es obligatorio")
        @Size(max = 60, message = "El color admite hasta 60 caracteres")
        String color,

        @Size(max = 5000, message = "La descripción admite hasta 5000 caracteres")
        String description
) {

    public CreateProductRequest {
        sku = sku == null ? null : sku.trim().toUpperCase(Locale.ROOT);
        brand = brand == null ? null : brand.trim();
        model = model == null ? null : model.trim();
        color = color == null ? null : color.trim();
        description = description == null ? null : description.trim();
    }
}