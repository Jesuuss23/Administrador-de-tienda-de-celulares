package com.celucanje.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public record RegisterRequest(

        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 120, message = "El nombre admite hasta 120 caracteres")
        String fullName,

        @NotBlank(message = "El correo es obligatorio")
        @Email(message = "El correo no tiene un formato válido")
        @Size(max = 254, message = "El correo es demasiado largo")
        String email,

        @NotBlank(message = "La contraseña es obligatoria")
        @Size(min = 12, max = 72,
                message = "La contraseña debe tener entre 12 y 72 caracteres")
        String password
) {

    public RegisterRequest {
        fullName = fullName == null ? null : fullName.trim();
        email = email == null
                ? null
                : email.trim().toLowerCase(Locale.ROOT);
    }
}