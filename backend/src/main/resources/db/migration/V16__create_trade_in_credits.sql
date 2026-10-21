ALTER TABLE trade_in_requests
    DROP CONSTRAINT ck_trade_in_status;

ALTER TABLE trade_in_requests
    ADD CONSTRAINT ck_trade_in_status
    CHECK (
        status IN (
            'SUBMITTED',
            'UNDER_REVIEW',
            'QUOTED',
            'ACCEPTED',
            'REJECTED',
            'CANCELLED',
            'RECEIVED',
            'CONFIRMED'
        )
    );

DROP INDEX uq_trade_in_active_imei;

CREATE UNIQUE INDEX uq_trade_in_active_imei
    ON trade_in_requests (imei)
    WHERE status IN (
        'SUBMITTED',
        'UNDER_REVIEW',
        'QUOTED',
        'ACCEPTED',
        'RECEIVED',
        'CONFIRMED'
    );

CREATE TABLE trade_in_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trade_in_id UUID NOT NULL UNIQUE
        REFERENCES trade_in_receipts(trade_in_id),

    customer_id UUID NOT NULL REFERENCES users(id),

    quote_id UUID NOT NULL UNIQUE REFERENCES trade_in_quotes(id),
    inspection_id UUID NOT NULL UNIQUE REFERENCES trade_in_inspections(id),

    request_key UUID NOT NULL,

    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',

    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',

    confirmed_by UUID NOT NULL REFERENCES users(id),
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_trade_in_credit_amount
        CHECK (amount > 0),

    CONSTRAINT ck_trade_in_credit_currency
        CHECK (currency = 'PEN'),

    CONSTRAINT ck_trade_in_credit_status
        CHECK (status IN ('AVAILABLE', 'RESERVED', 'USED', 'VOID'))
);

CREATE INDEX idx_trade_in_credits_customer
    ON trade_in_credits (customer_id, status, confirmed_at DESC);