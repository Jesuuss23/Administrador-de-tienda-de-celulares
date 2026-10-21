CREATE TABLE warranty_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    warranty_id UUID NOT NULL REFERENCES warranties(id),
    request_key UUID NOT NULL,

    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',

    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_warranty_claim_request
        UNIQUE (warranty_id, request_key),

    CONSTRAINT ck_warranty_claim_description
        CHECK (LENGTH(TRIM(description)) BETWEEN 20 AND 2000),

    CONSTRAINT ck_warranty_claim_status
        CHECK (
            status IN (
                'RECEIVED',
                'UNDER_REVIEW',
                'ACCEPTED',
                'REJECTED',
                'RESOLVED'
            )
        ),

    CONSTRAINT ck_warranty_claim_resolution
        CHECK (
            (
                status IN ('REJECTED', 'RESOLVED')
                AND resolution_notes IS NOT NULL
                AND LENGTH(TRIM(resolution_notes)) > 0
                AND resolved_at IS NOT NULL
                AND resolved_by IS NOT NULL
            )
            OR
            (
                status IN ('RECEIVED', 'UNDER_REVIEW', 'ACCEPTED')
                AND resolution_notes IS NULL
                AND resolved_at IS NULL
                AND resolved_by IS NULL
            )
        )
);

CREATE UNIQUE INDEX uq_warranty_claim_open
    ON warranty_claims (warranty_id)
    WHERE status IN ('RECEIVED', 'UNDER_REVIEW', 'ACCEPTED');

CREATE INDEX idx_warranty_claims_queue
    ON warranty_claims (status, created_at);

CREATE INDEX idx_warranty_claims_history
    ON warranty_claims (warranty_id, created_at DESC);