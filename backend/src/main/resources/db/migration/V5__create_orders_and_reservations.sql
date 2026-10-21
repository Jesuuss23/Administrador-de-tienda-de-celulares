CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    request_key UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_order_request UNIQUE (user_id, request_key),

    CONSTRAINT ck_order_status CHECK (
        status IN ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED')
    ),

    CONSTRAINT ck_order_currency CHECK (currency = 'PEN')
);

CREATE UNIQUE INDEX uk_user_pending_order
    ON sales_orders(user_id)
    WHERE status = 'PENDING_PAYMENT';

CREATE TABLE sales_order_items (
    order_id UUID NOT NULL REFERENCES sales_orders(id),
    unit_id UUID NOT NULL REFERENCES inventory_units(id),
    product_name VARCHAR(300) NOT NULL,
    storage_gb INTEGER NOT NULL,
    color VARCHAR(60) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),

    PRIMARY KEY (order_id, unit_id)
);

CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES sales_orders(id),
    unit_id UUID NOT NULL REFERENCES inventory_units(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT uk_order_unit_reservation UNIQUE (order_id, unit_id),

    CONSTRAINT ck_reservation_status CHECK (
        status IN ('ACTIVE', 'RELEASED', 'CONSUMED')
    )
);

CREATE UNIQUE INDEX uk_active_unit_reservation
    ON inventory_reservations(unit_id)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_pending_order_expiration
    ON sales_orders(expires_at)
    WHERE status = 'PENDING_PAYMENT';

CREATE INDEX idx_orders_user
    ON sales_orders(user_id, created_at);

-- Los eventos automáticos del sistema no tienen un usuario ejecutor.
ALTER TABLE audit_events
    ALTER COLUMN actor_id DROP NOT NULL;