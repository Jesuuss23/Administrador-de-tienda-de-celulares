package com.celucanje.identity.controller;

import com.celucanje.identity.dto.UserResponse;
import com.celucanje.identity.service.CurrentUserService;

import java.security.Principal;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AccountController {

    private final CurrentUserService currentUserService;

    public AccountController(CurrentUserService currentUserService) {
        this.currentUserService = currentUserService;
    }

    @GetMapping("/me")
    public UserResponse getCurrentUser(Principal principal) {
        return currentUserService.getCurrentUser(principal.getName());
    }
}