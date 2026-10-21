package com.celucanje.ai.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GeminiConnectionService {

    private final RestClient client;
    private final String apiKey;
    private final String configuredModel;

    public GeminiConnectionService(
            @Value("${app.ai.gemini.api-key:}") String apiKey,
            @Value("${app.ai.gemini.model:}") String configuredModel,
            @Value("${app.ai.gemini.timeout-seconds:60}") int timeoutSeconds
    ) {
        this.apiKey = apiKey.trim();
        this.configuredModel = configuredModel.trim();

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        var factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(
                Duration.ofSeconds(Math.max(1, timeoutSeconds))
        );

        this.client = RestClient.builder()
                .baseUrl("https://generativelanguage.googleapis.com")
                .requestFactory(factory)
                .build();
    }

    public ConnectionResponse checkConnection() {
        if (apiKey.isBlank() || apiKey.equals("PEGA_AQUI_TU_CLAVE")) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Configura la clave en gemini-local.properties"
            );
        }

        GoogleModelsResponse response;

        try {
            response = client.get()
                    .uri("/v1beta/models?pageSize=1000")
                    .header("x-goog-api-key", apiKey)
                    .retrieve()
                    .body(GoogleModelsResponse.class);

        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();

            String message = switch (status) {
                case 400 ->
                    "Google rechazó la solicitud. Revisa la clave configurada.";
                case 401, 403 ->
                    "Google rechazó el acceso. Revisa la clave, sus permisos "
                    + "y la habilitación de la API en tu proyecto.";
                case 429 ->
                    "Gemini alcanzó un límite de solicitudes. Inténtalo después.";
                default ->
                    "No se pudo consultar Gemini. Google respondió HTTP "
                    + status + ".";
            };

            // No devolvemos la clave ni la respuesta interna de Google.
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    message
            );

        } catch (ResourceAccessException ex) {
            throw new ResponseStatusException(
                    HttpStatus.GATEWAY_TIMEOUT,
                    "No se pudo conectar con Gemini dentro del plazo. "
                    + "Revisa la conexión a internet."
            );

        } catch (RestClientException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "No se pudo interpretar la respuesta de Gemini"
            );
        }

        if (response == null || response.models() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Gemini devolvió una respuesta sin listado de modelos"
            );
        }

        List<ModelItem> models = response.models().stream()
                .filter(model -> model.name() != null)
                .filter(model -> model.name().startsWith("models/gemini"))
                .filter(model ->
                    model.supportedGenerationMethods() != null
                    && model.supportedGenerationMethods()
                            .contains("generateContent")
                )
                .map(model -> new ModelItem(
                        model.name().substring("models/".length()),
                        model.displayName()
                ))
                .sorted((first, second) ->
                    first.id().compareTo(second.id())
                )
                .toList();

        boolean configuredModelListed = models.stream()
                .anyMatch(model -> model.id().equals(configuredModel));

        boolean hasMore = response.nextPageToken() != null
                && !response.nextPageToken().isBlank();

        return new ConnectionResponse(
                "CONNECTED",
                "Gemini aceptó la consulta de modelos",
                configuredModel,
                configuredModelListed,
                hasMore,
                models
        );
    }

    public record ConnectionResponse(
            String status,
            String message,
            String configuredModel,
            boolean configuredModelListed,
            boolean hasMore,
            List<ModelItem> models
    ) {
    }

    public record ModelItem(
            String id,
            String displayName
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GoogleModelsResponse(
            List<GoogleModel> models,
            String nextPageToken
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GoogleModel(
            String name,
            String displayName,
            List<String> supportedGenerationMethods
    ) {
    }
}