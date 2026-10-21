package com.celucanje.demand.service;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SearchDemandService {

    private final JdbcTemplate jdbc;

    public SearchDemandService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record SearchRequest(
            @NotNull
            UUID eventId,

            @NotBlank
            @Size(max = 100)
            String searchTerm,

            @NotBlank
            @Pattern(regexp = "ALL|NEW|USED|REFURBISHED")
            String condition,

            @NotNull
            @Min(0)
            @Max(1000000)
            Long reportedResultCount
    ) {
        public SearchRequest {
            if (searchTerm != null) {
                searchTerm = Normalizer.normalize(
                        searchTerm,
                        Normalizer.Form.NFKC
                )
                        .replaceAll("(?U)\\s+", " ")
                        .trim()
                        .toLowerCase(Locale.ROOT);
            }
        }
    }

    public record Receipt(boolean received) {
    }

    public record SearchTerm(
            String term,
            String condition,
            long searches,
            long withoutResults
    ) {
    }

    public record Report(
            int days,
            long totalSearches,
            long searchesWithoutResults,
            List<SearchTerm> topTerms
    ) {
    }

    @Transactional
    public Receipt record(SearchRequest request) {
        jdbc.update(
                """
                INSERT INTO catalog_search_events (
                    event_id,
                    search_term,
                    product_condition,
                    reported_result_count
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT (event_id) DO NOTHING
                """,
                request.eventId(),
                request.searchTerm(),
                request.condition(),
                request.reportedResultCount()
        );

        return new Receipt(true);
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ
    )
    public Report report(int days) {
        if (days != 7 && days != 30 && days != 90) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Selecciona un período de 7, 30 o 90 días"
            );
        }

        long[] totals = jdbc.queryForObject(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE reported_result_count = 0
                    ) AS without_results
                FROM catalog_search_events
                WHERE created_at >= CURRENT_TIMESTAMP
                    - (CAST(? AS integer) * INTERVAL '1 day')
                """,
                (rs, row) -> new long[]{
                    rs.getLong("total"),
                    rs.getLong("without_results")
                },
                days
        );

        List<SearchTerm> terms = jdbc.query(
                """
                SELECT
                    search_term,
                    product_condition,
                    COUNT(*) AS searches,
                    COUNT(*) FILTER (
                        WHERE reported_result_count = 0
                    ) AS without_results
                FROM catalog_search_events
                WHERE created_at >= CURRENT_TIMESTAMP
                    - (CAST(? AS integer) * INTERVAL '1 day')
                GROUP BY search_term, product_condition
                ORDER BY searches DESC,
                         search_term,
                         product_condition
                LIMIT 20
                """,
                (rs, row) -> new SearchTerm(
                        rs.getString("search_term"),
                        rs.getString("product_condition"),
                        rs.getLong("searches"),
                        rs.getLong("without_results")
                ),
                days
        );

        return new Report(
                days,
                totals == null ? 0 : totals[0],
                totals == null ? 0 : totals[1],
                terms
        );
    }
}