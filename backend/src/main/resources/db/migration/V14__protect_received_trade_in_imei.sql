DROP INDEX uq_trade_in_active_imei;

CREATE UNIQUE INDEX uq_trade_in_active_imei
    ON trade_in_requests (imei)
    WHERE status IN (
        'SUBMITTED',
        'UNDER_REVIEW',
        'QUOTED',
        'ACCEPTED',
        'RECEIVED'
    );