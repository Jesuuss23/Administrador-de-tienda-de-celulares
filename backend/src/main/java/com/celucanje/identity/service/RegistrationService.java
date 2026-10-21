package com.celucanje.identity.service;

import com.celucanje.identity.dto.RegisterRequest;
import com.celucanje.identity.dto.UserResponse;
import com.celucanje.identity.entity.Role;
import com.celucanje.identity.entity.RoleName;
import com.celucanje.identity.entity.User;
import com.celucanje.identity.repository.RoleRepository;
import com.celucanje.identity.repository.UserRepository;

import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RegistrationService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    public RegistrationService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {

        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La contraseña supera el límite de 72 bytes"
            );
        }

        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe una cuenta con ese correo"
            );
        }

        Role customerRole = roleRepository.findByName(RoleName.CUSTOMER)
                .orElseThrow(() -> new IllegalStateException(
                        "No se encontró el rol CUSTOMER"
                ));

        User user = new User(
                request.fullName(),
                request.email(),
                passwordEncoder.encode(request.password())
        );

        user.addRole(customerRole);

        User savedUser = userRepository.saveAndFlush(user);

        return UserResponse.from(savedUser);
    }
}