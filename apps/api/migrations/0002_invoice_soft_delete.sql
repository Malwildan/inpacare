-- Soft delete for invoices: the row and its history are kept, only hidden from lists.
ALTER TABLE invoices ADD COLUMN deleted_at timestamptz;
CREATE INDEX invoices_active ON invoices(created_at DESC) WHERE deleted_at IS NULL;
