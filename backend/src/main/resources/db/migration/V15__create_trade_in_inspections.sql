CREATE TABLE trade_in_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trade_in_id UUID NOT NULL
        REFERENCES trade_in_receipts(trade_in_id),

    request_key UUID NOT NULL,

    screen_test VARCHAR(20) NOT NULL,
    touch_test VARCHAR(20) NOT NULL,
    cameras_test VARCHAR(20) NOT NULL,
    audio_test VARCHAR(20) NOT NULL,
    charging_test VARCHAR(20) NOT NULL,
    connectivity_test VARCHAR(20) NOT NULL,

    imei_matches BOOLEAN NOT NULL,
    account_locks_removed BOOLEAN NOT NULL,
    condition_matches BOOLEAN NOT NULL,

    notes TEXT NOT NULL,
    result VARCHAR(30) NOT NULL,

    inspected_by UUID NOT NULL REFERENCES users(id),
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_trade_in_inspection_request
        UNIQUE (trade_in_id, request_key),

    CONSTRAINT ck_trade_in_inspection_tests
        CHECK (
            screen_test IN ('PASS', 'FAIL', 'NOT_TESTED')
            AND touch_test IN ('PASS', 'FAIL', 'NOT_TESTED')
            AND cameras_test IN ('PASS', 'FAIL', 'NOT_TESTED')
            AND audio_test IN ('PASS', 'FAIL', 'NOT_TESTED')
            AND charging_test IN ('PASS', 'FAIL', 'NOT_TESTED')
            AND connectivity_test IN ('PASS', 'FAIL', 'NOT_TESTED')
        ),

    CONSTRAINT ck_trade_in_inspection_notes
        CHECK (LENGTH(TRIM(notes)) BETWEEN 20 AND 3000),

    CONSTRAINT ck_trade_in_inspection_result
        CHECK (
            result = CASE
                WHEN screen_test = 'PASS'
                 AND touch_test = 'PASS'
                 AND cameras_test = 'PASS'
                 AND audio_test = 'PASS'
                 AND charging_test = 'PASS'
                 AND connectivity_test = 'PASS'
                 AND imei_matches
                 AND account_locks_removed
                 AND condition_matches
                THEN 'MATCHES_OFFER'
                ELSE 'REQUIRES_REVIEW'
            END
        )
);

CREATE INDEX idx_trade_in_inspection_history
    ON trade_in_inspections (trade_in_id, inspected_at DESC);