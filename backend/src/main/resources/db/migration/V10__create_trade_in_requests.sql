CREATE TABLE trade_in_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID NOT NULL REFERENCES users(id),
    request_key UUID NOT NULL,

    brand VARCHAR(80) NOT NULL,
    model VARCHAR(120) NOT NULL,
    storage_gb INTEGER NOT NULL,
    color VARCHAR(60) NOT NULL,

    imei VARCHAR(15) NOT NULL,
    condition_description TEXT NOT NULL,
    functional_issues TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_trade_in_request_key
        UNIQUE (customer_id, request_key),

    CONSTRAINT ck_trade_in_storage
        CHECK (storage_gb BETWEEN 1 AND 8192),

    CONSTRAINT ck_trade_in_imei_format
        CHECK (imei ~ '^[0-9]{15}$'),

    CONSTRAINT ck_trade_in_device_text
        CHECK (
            LENGTH(TRIM(brand)) > 0
            AND LENGTH(TRIM(model)) > 0
            AND LENGTH(TRIM(color)) > 0
        ),

    CONSTRAINT ck_trade_in_condition_description
        CHECK (
            LENGTH(TRIM(condition_description)) BETWEEN 20 AND 2000
        ),

    CONSTRAINT ck_trade_in_functional_issues
        CHECK (
            LENGTH(TRIM(functional_issues)) BETWEEN 2 AND 2000
        ),

    CONSTRAINT ck_trade_in_status
        CHECK (
            status IN (
                'SUBMITTED',
                'UNDER_REVIEW',
                'QUOTED',
                'ACCEPTED',
                'REJECTED',
                'CANCELLED',
                'RECEIVED'
            )
        )
);

CREATE UNIQUE INDEX uq_trade_in_active_imei
    ON trade_in_requests (imei)
    WHERE status IN (
        'SUBMITTED',
        'UNDER_REVIEW',
        'QUOTED',
        'ACCEPTED'
    );

CREATE INDEX idx_trade_in_customer_created
    ON trade_in_requests (customer_id, created_at DESC);

CREATE INDEX idx_trade_in_review_queue
    ON trade_in_requests (status, created_at);