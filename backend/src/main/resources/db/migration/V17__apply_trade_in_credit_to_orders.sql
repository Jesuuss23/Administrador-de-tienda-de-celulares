-- Evita asignar saldos incorrectos si ya existieran créditos utilizados
-- por una implementación anterior.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM trade_in_credits
        WHERE status IN ('RESERVED', 'USED')
    ) THEN
        RAISE EXCEPTION
            'Hay créditos reservados o utilizados. Deben conciliarse antes de continuar.';
    END IF;
END $$;


-- Se conserva amount como importe original del crédito.
ALTER TABLE trade_in_credits
    ADD COLUMN reserved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

    ADD COLUMN used_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

    ADD CONSTRAINT ck_trade_credit_balances
        CHECK (
            reserved_amount >= 0
            AND used_amount >= 0
            AND reserved_amount + used_amount <= amount
        );


-- El total del pedido se conserva.
-- La diferencia se calcula automáticamente en PostgreSQL.
ALTER TABLE sales_orders
    ADD COLUMN trade_in_credit_id UUID
        REFERENCES trade_in_credits(id),

    ADD COLUMN credit_applied NUMERIC(14, 2) NOT NULL DEFAULT 0,

    ADD COLUMN amount_due NUMERIC(14, 2)
        GENERATED ALWAYS AS (
            total_amount - credit_applied
        ) STORED,

    ADD COLUMN settlement_environment VARCHAR(4),

    ADD CONSTRAINT ck_order_credit_amount
        CHECK (
            credit_applied >= 0
            AND credit_applied <= total_amount
            AND (
                (
                    trade_in_credit_id IS NULL
                    AND credit_applied = 0
                )
                OR
                (
                    trade_in_credit_id IS NOT NULL
                    AND credit_applied > 0
                )
            )
        ),

    ADD CONSTRAINT ck_order_settlement_environment
        CHECK (
            settlement_environment IN ('TEST', 'LIVE')
        );


-- Conserva el entorno de los pedidos que ya estaban pagados.
UPDATE sales_orders o
SET settlement_environment = p.environment
FROM payment_attempts p
WHERE p.order_id = o.id
  AND p.status = 'APPROVED'
  AND o.status = 'PAID';


-- Historial de la parte del crédito asignada a cada pedido.
CREATE TABLE order_credit_allocations (
    order_id UUID PRIMARY KEY
        REFERENCES sales_orders(id),

    credit_id UUID NOT NULL
        REFERENCES trade_in_credits(id),

    amount NUMERIC(14, 2) NOT NULL,

    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_order_credit_allocation_amount
        CHECK (amount > 0),

    CONSTRAINT ck_order_credit_allocation_status
        CHECK (
            status IN (
                'ACTIVE',
                'CONSUMED',
                'RELEASED'
            )
        )
);


CREATE INDEX idx_order_credit_allocations_credit
    ON order_credit_allocations (credit_id, status);