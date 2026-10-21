CREATE TABLE trade_in_receipts (
    trade_in_id UUID PRIMARY KEY REFERENCES trade_in_requests(id),

    request_key UUID NOT NULL,
    received_imei VARCHAR(15) NOT NULL,
    receipt_reference VARCHAR(120) NOT NULL,
    reception_notes TEXT NOT NULL,

    received_by UUID NOT NULL REFERENCES users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_trade_in_receipt_imei
        CHECK (received_imei ~ '^[0-9]{15}$'),

    CONSTRAINT ck_trade_in_receipt_reference
        CHECK (LENGTH(TRIM(receipt_reference)) BETWEEN 3 AND 120),

    CONSTRAINT ck_trade_in_receipt_notes
        CHECK (LENGTH(TRIM(reception_notes)) BETWEEN 20 AND 2000)
);