CREATE TABLE warranty_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code VARCHAR(60) NOT NULL,
    version INTEGER NOT NULL,
    name VARCHAR(160) NOT NULL,

    product_condition VARCHAR(20) NOT NULL,
    duration_days INTEGER NOT NULL,

    coverage TEXT NOT NULL,
    exclusions TEXT NOT NULL,

    environment VARCHAR(10) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_warranty_policy_version
        UNIQUE (code, version),

    CONSTRAINT ck_warranty_policy_version
        CHECK (version > 0),

    CONSTRAINT ck_warranty_policy_duration
        CHECK (duration_days > 0),

    CONSTRAINT ck_warranty_policy_condition
        CHECK (
            product_condition IN ('NEW', 'USED', 'REFURBISHED')
        ),

    CONSTRAINT ck_warranty_policy_environment
        CHECK (environment IN ('TEST', 'LIVE')),

    CONSTRAINT ck_warranty_policy_text
        CHECK (
            LENGTH(TRIM(code)) > 0
            AND LENGTH(TRIM(name)) > 0
            AND LENGTH(TRIM(coverage)) > 0
            AND LENGTH(TRIM(exclusions)) > 0
        )
);

-- Una política activa por condición y entorno.
CREATE UNIQUE INDEX uq_active_warranty_policy
    ON warranty_policies (product_condition, environment)
    WHERE active = TRUE;


CREATE TABLE warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL,
    unit_id UUID NOT NULL,

    policy_id UUID NOT NULL REFERENCES warranty_policies(id),

    -- Copia de las condiciones aplicadas al emitir la garantía.
    policy_name VARCHAR(160) NOT NULL,
    policy_version INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    coverage TEXT NOT NULL,
    exclusions TEXT NOT NULL,

    -- Copia de los identificadores del equipo.
    -- Permite representar equipos con más de un IMEI.
    identifiers_snapshot JSONB NOT NULL,

    environment VARCHAR(10) NOT NULL,

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',

    issued_by UUID NOT NULL REFERENCES users(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    voided_by UUID REFERENCES users(id),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,

    CONSTRAINT fk_warranty_order_item
        FOREIGN KEY (order_id, unit_id)
        REFERENCES sales_order_items (order_id, unit_id),

    CONSTRAINT uq_warranty_order_unit
        UNIQUE (order_id, unit_id),

    CONSTRAINT ck_warranty_environment
        CHECK (environment IN ('TEST', 'LIVE')),

    CONSTRAINT ck_warranty_status
        CHECK (status IN ('ISSUED', 'VOID')),

    CONSTRAINT ck_warranty_dates
        CHECK (ends_at > starts_at),

    CONSTRAINT ck_warranty_policy_snapshot
        CHECK (
            policy_version > 0
            AND duration_days > 0
            AND LENGTH(TRIM(policy_name)) > 0
            AND LENGTH(TRIM(coverage)) > 0
            AND LENGTH(TRIM(exclusions)) > 0
        ),

    CONSTRAINT ck_warranty_identifiers
        CHECK (
            JSONB_TYPEOF(identifiers_snapshot) = 'array'
            AND identifiers_snapshot <> '[]'::jsonb
        ),

    CONSTRAINT ck_warranty_void_data
        CHECK (
            (
                status = 'ISSUED'
                AND voided_by IS NULL
                AND voided_at IS NULL
                AND void_reason IS NULL
            )
            OR
            (
                status = 'VOID'
                AND voided_by IS NOT NULL
                AND voided_at IS NOT NULL
                AND void_reason IS NOT NULL
                AND LENGTH(TRIM(void_reason)) > 0
            )
        )
);

CREATE INDEX idx_warranties_unit
    ON warranties (unit_id);

CREATE INDEX idx_warranties_expiration
    ON warranties (ends_at)
    WHERE status = 'ISSUED';