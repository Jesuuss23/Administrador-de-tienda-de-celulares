CREATE TABLE trade_in_visual_analysis_photos (
    analysis_id UUID NOT NULL
        REFERENCES trade_in_visual_analyses(id),

    angle VARCHAR(20) NOT NULL,
    source_photo_id UUID NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    image_data BYTEA NOT NULL,
    sha256 VARCHAR(64) NOT NULL,

    PRIMARY KEY (analysis_id, angle),

    CONSTRAINT ck_visual_evidence_angle
        CHECK (angle IN ('FRONT', 'BACK', 'LEFT', 'RIGHT')),

    CONSTRAINT ck_visual_evidence_type
        CHECK (content_type = 'image/jpeg'),

    CONSTRAINT ck_visual_evidence_size
        CHECK (
            octet_length(image_data) > 0
            AND octet_length(image_data) <= 6291456
        ),

    CONSTRAINT ck_visual_evidence_hash
        CHECK (sha256 ~ '^[0-9a-f]{64}$')
);