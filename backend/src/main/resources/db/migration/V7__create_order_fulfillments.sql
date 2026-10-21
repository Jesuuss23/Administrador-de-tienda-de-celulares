CREATE TABLE order_fulfillments (
    order_id UUID PRIMARY KEY REFERENCES sales_orders(id),
    status VARCHAR(30) NOT NULL,
    recipient_name VARCHAR(120),
    delivery_reference VARCHAR(200),
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivered_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_fulfillment_status CHECK (
        status IN ('PREPARING', 'READY', 'DELIVERED')
    ),

    CONSTRAINT ck_delivered_information CHECK (
        status <> 'DELIVERED'
        OR (
            recipient_name IS NOT NULL
            AND char_length(trim(recipient_name)) > 0
            AND delivery_reference IS NOT NULL
            AND char_length(trim(delivery_reference)) > 0
            AND delivered_at IS NOT NULL
            AND delivered_by IS NOT NULL
        )
    )
);

CREATE INDEX idx_fulfillments_status
    ON order_fulfillments(status);