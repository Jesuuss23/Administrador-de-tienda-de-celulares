CREATE TABLE trade_in_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trade_in_id UUID NOT NULL REFERENCES trade_in_requests(id),
    angle VARCHAR(20) NOT NULL,

    image_data BYTEA NOT NULL,
    content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',

    width INTEGER NOT NULL,
    height INTEGER NOT NULL,

    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_trade_in_photo_angle
        UNIQUE (trade_in_id, angle),

    CONSTRAINT ck_trade_in_photo_angle
        CHECK (angle IN ('FRONT', 'BACK', 'LEFT', 'RIGHT')),

    CONSTRAINT ck_trade_in_photo_content_type
        CHECK (content_type = 'image/jpeg'),

    CONSTRAINT ck_trade_in_photo_size
        CHECK (
            OCTET_LENGTH(image_data) > 0
            AND OCTET_LENGTH(image_data) <= 6291456
        ),

    CONSTRAINT ck_trade_in_photo_dimensions
        CHECK (
            width BETWEEN 320 AND 6000
            AND height BETWEEN 320 AND 6000
            AND width::BIGINT * height::BIGINT <= 12000000
        )
);