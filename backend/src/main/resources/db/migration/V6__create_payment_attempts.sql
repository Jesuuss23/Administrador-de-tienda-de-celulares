CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES sales_orders(id),
    request_key UUID NOT NULL,
    environment VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_payment_request UNIQUE (order_id, request_key),

    CONSTRAINT ck_payment_environment
        CHECK (environment IN ('TEST', 'LIVE')),

    CONSTRAINT ck_payment_status
        CHECK (status IN ('APPROVED', 'DECLINED')),

    CONSTRAINT ck_payment_currency CHECK (currency = 'PEN')
);

CREATE UNIQUE INDEX uk_approved_payment_per_order
    ON payment_attempts(order_id)
    WHERE status = 'APPROVED';

CREATE INDEX idx_payment_attempts_order
    ON payment_attempts(order_id, created_at);