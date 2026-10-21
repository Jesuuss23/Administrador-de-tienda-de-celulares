CREATE TABLE catalog_search_events (
    event_id UUID PRIMARY KEY,

    search_term VARCHAR(100) NOT NULL,
    product_condition VARCHAR(20) NOT NULL,

    reported_result_count BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_catalog_search_term
        CHECK (LENGTH(BTRIM(search_term)) BETWEEN 1 AND 100),

    CONSTRAINT ck_catalog_search_condition
        CHECK (
            product_condition IN (
                'ALL',
                'NEW',
                'USED',
                'REFURBISHED'
            )
        ),

    CONSTRAINT ck_catalog_search_results
        CHECK (reported_result_count BETWEEN 0 AND 1000000)
);

CREATE INDEX idx_catalog_search_events_created_at
    ON catalog_search_events (created_at DESC);