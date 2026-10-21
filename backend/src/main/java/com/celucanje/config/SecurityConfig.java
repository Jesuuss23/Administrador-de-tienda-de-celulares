package com.celucanje.config;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import jakarta.servlet.DispatcherType;

@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder
    ) {
        DaoAuthenticationProvider provider =
                new DaoAuthenticationProvider(userDetailsService);

        provider.setPasswordEncoder(passwordEncoder);

        return provider;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            DaoAuthenticationProvider authenticationProvider
    ) throws Exception {

        http.authenticationProvider(authenticationProvider);

        http.authorizeHttpRequests(authorize -> authorize

                .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()

                .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/status",
                        "/actuator/health",
                        "/api/v1/auth/csrf",
                        "/api/v1/catalog/products",
                        "/api/v1/catalog/products/*"
                ).permitAll()

                .requestMatchers(
                        HttpMethod.POST,
                        "/api/v1/auth/register",
                        "/api/v1/auth/login",
                        "/api/v1/catalog/search-events",
                        "/api/v1/catalog/product-view-events"
                ).permitAll()

                .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/auth/me"
                ).authenticated()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/cart", "/api/v1/cart/**").authenticated()
                .requestMatchers(        "/api/v1/orders", "/api/v1/orders/**").authenticated()
                .requestMatchers( "/api/v1/trade-ins", "/api/v1/trade-ins/**" ).authenticated()
                .anyRequest().denyAll()
        );

        http.formLogin(form -> form
                .loginProcessingUrl("/api/v1/auth/login")
                .usernameParameter("email")
                .passwordParameter("password")

                .successHandler((request, response, authentication) ->
                        writeJson(
                                response,
                                HttpServletResponse.SC_OK,
                                "{\"message\":\"Sesión iniciada correctamente\"}"
                        )
                )

                .failureHandler((request, response, exception) ->
                        writeJson(
                                response,
                                HttpServletResponse.SC_UNAUTHORIZED,
                                "{\"message\":\"Correo o contraseña incorrectos\"}"
                        )
                )
        );

        http.logout(logout -> logout
                .logoutUrl("/api/v1/auth/logout")
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("JSESSIONID")

                .logoutSuccessHandler((request, response, authentication) ->
                        writeJson(
                                response,
                                HttpServletResponse.SC_OK,
                                "{\"message\":\"Sesión cerrada correctamente\"}"
                        )
                )
        );

        http.exceptionHandling(exceptions -> exceptions

                .authenticationEntryPoint((request, response, exception) ->
                        writeJson(
                                response,
                                HttpServletResponse.SC_UNAUTHORIZED,
                                "{\"message\":\"Debes iniciar sesión\"}"
                        )
                )

                .accessDeniedHandler((request, response, exception) ->
                        writeJson(
                                response,
                                HttpServletResponse.SC_FORBIDDEN,
                                "{\"message\":\"Acceso denegado o token CSRF inválido\"}"
                        )
                )
        );

        http.requestCache(cache -> cache.disable());

        return http.build();
    }

    private static void writeJson(
            HttpServletResponse response,
            int status,
            String body
    ) throws IOException {

        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(body);
    }
}