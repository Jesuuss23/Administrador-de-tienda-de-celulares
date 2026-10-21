package com.celucanje.identity.dto;

import com.celucanje.identity.entity.User;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public record UserResponse(
        UUID id,
        String fullName,
        String email,
        boolean emailVerified,
        Set<String> roles,
        Instant createdAt
) {

    public static UserResponse from(User user) {
        Set<String> roleNames = user.getRoles().stream()
                .map(role -> role.getName().name())
                .collect(Collectors.toSet());

        return new UserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.isEmailVerified(),
                roleNames,
                user.getCreatedAt()
        );
    }
}