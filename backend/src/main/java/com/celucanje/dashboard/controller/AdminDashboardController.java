package com.celucanje.dashboard.controller;

import com.celucanje.dashboard.service.AdminDashboardService;
import com.celucanje.dashboard.service.AdminDashboardService.Summary;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/dashboard")
public class AdminDashboardController {

    private final AdminDashboardService dashboard;

    public AdminDashboardController(AdminDashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping
    public Summary getSummary() {
        return dashboard.getSummary();
    }
}