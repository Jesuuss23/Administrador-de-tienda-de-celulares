CREATE TABLE catalog_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(60) NOT NULL UNIQUE,
    brand VARCHAR(80) NOT NULL,
    model VARCHAR(120) NOT NULL,
    storage_gb INTEGER NOT NULL CHECK (storage_gb > 0),
    color VARCHAR(60) NOT NULL,
    description TEXT,
    image_url VARCHAR(1000),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_catalog_product_name
        CHECK (
            char_length(trim(brand)) > 0
            AND char_length(trim(model)) > 0
            AND char_length(trim(color)) > 0
            AND char_length(trim(sku)) > 0
        )
);

CREATE TABLE inventory_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES catalog_products(id),
    internal_code VARCHAR(60) NOT NULL UNIQUE,
    condition VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_INSPECTION',
    acquisition_cost NUMERIC(12, 2) NOT NULL CHECK (acquisition_cost >= 0),
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    condition_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_inventory_condition
        CHECK (condition IN ('NEW', 'USED', 'REFURBISHED')),

    CONSTRAINT ck_inventory_status
        CHECK (status IN (
            'PENDING_INSPECTION',
            'REFURBISHING',
            'AVAILABLE',
            'RESERVED',
            'SOLD',
            'WRITTEN_OFF'
        )),

    CONSTRAINT ck_inventory_currency CHECK (currency = 'PEN')
);

CREATE TABLE unit_identifiers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id UUID NOT NULL REFERENCES inventory_units(id),
    identifier_type VARCHAR(20) NOT NULL,
    value VARCHAR(100) NOT NULL,

    CONSTRAINT ck_identifier_type
        CHECK (identifier_type IN ('IMEI', 'SERIAL')),

    CONSTRAINT uk_unit_identifier UNIQUE (identifier_type, value)
);

CREATE INDEX idx_inventory_product_status
    ON inventory_units(product_id, status, condition);

CREATE INDEX idx_unit_identifiers_unit
    ON unit_identifiers(unit_id);