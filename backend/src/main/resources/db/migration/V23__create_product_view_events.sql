CREATE TABLE catalog_product_view_events (
    event_id UUID PRIMARY KEY,

    product_id UUID NOT NULL REFERENCES catalog_products(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_view_events_created
    ON catalog_product_view_events (created_at DESC);

CREATE INDEX idx_product_view_events_product
    ON catalog_product_view_events (product_id, created_at DESC);