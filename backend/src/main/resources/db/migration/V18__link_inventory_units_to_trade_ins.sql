ALTER TABLE inventory_units
    ADD COLUMN source_trade_in_id UUID;

ALTER TABLE inventory_units
    ADD CONSTRAINT fk_inventory_unit_source_trade_in
    FOREIGN KEY (source_trade_in_id)
    REFERENCES trade_in_receipts(trade_in_id);

ALTER TABLE inventory_units
    ADD CONSTRAINT uq_inventory_unit_source_trade_in
    UNIQUE (source_trade_in_id);