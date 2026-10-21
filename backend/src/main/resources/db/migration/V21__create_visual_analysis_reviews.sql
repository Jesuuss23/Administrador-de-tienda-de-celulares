CREATE TABLE trade_in_visual_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    analysis_id UUID NOT NULL UNIQUE
        REFERENCES trade_in_visual_analyses(id),

    request_key UUID NOT NULL,

    decision VARCHAR(30) NOT NULL,
    notes VARCHAR(2000) NOT NULL,

    reviewed_by UUID NOT NULL REFERENCES users(id),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_visual_review_decision
        CHECK (
            decision IN (
                'AGREE',
                'DISAGREE',
                'NEEDS_MORE_EVIDENCE'
            )
        ),

    CONSTRAINT ck_visual_review_notes
        CHECK (LENGTH(BTRIM(notes)) > 0)
);