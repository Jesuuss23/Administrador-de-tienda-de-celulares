CREATE TABLE trade_in_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trade_in_id UUID NOT NULL REFERENCES trade_in_requests(id),
    request_key UUID NOT NULL,

    offered_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',

    assessment_notes TEXT NOT NULL,
    conditions TEXT NOT NULL,

    validity_days INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'OFFERED',

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    responded_at TIMESTAMPTZ,

    CONSTRAINT uq_trade_in_quote_request
        UNIQUE (trade_in_id),

    CONSTRAINT ck_trade_in_quote_amount
        CHECK (offered_amount > 0),

    CONSTRAINT ck_trade_in_quote_currency
        CHECK (currency = 'PEN'),

    CONSTRAINT ck_trade_in_quote_validity
        CHECK (validity_days BETWEEN 1 AND 30),

    CONSTRAINT ck_trade_in_quote_expiration
        CHECK (expires_at > created_at),

    CONSTRAINT ck_trade_in_quote_notes
        CHECK (
            LENGTH(TRIM(assessment_notes)) BETWEEN 20 AND 3000
            AND LENGTH(TRIM(conditions)) > 0
        ),

    CONSTRAINT ck_trade_in_quote_status
        CHECK (status IN ('OFFERED', 'ACCEPTED', 'DECLINED')),

    CONSTRAINT ck_trade_in_quote_response
        CHECK (
            (status = 'OFFERED' AND responded_at IS NULL)
            OR
            (status IN ('ACCEPTED', 'DECLINED')
                AND responded_at IS NOT NULL)
        )
);

CREATE INDEX idx_trade_in_quote_expiration
    ON trade_in_quotes (expires_at)
    WHERE status = 'OFFERED';