-- Adds immutable sale payments, refunds, delivery tracking, and local reservations.
ALTER TABLE crm_sales
  ADD COLUMN payment_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'delivered'
    CHECK (delivery_status IN ('pending', 'ready', 'delivered', 'cancelled')),
  ADD COLUMN scheduled_delivery_at timestamptz,
  ADD COLUMN delivered_at timestamptz;

UPDATE crm_sales
SET delivered_at = occurred_at
WHERE delivery_status = 'delivered' AND delivered_at IS NULL;

CREATE INDEX ix_crm_sales_delivery
  ON crm_sales(delivery_status, scheduled_delivery_at)
  WHERE status = 'posted';

CREATE TABLE crm_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES crm_sales(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('payment', 'refund')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CHECK (entry_type <> 'refund' OR length(trim(COALESCE(reason, ''))) >= 3)
);
CREATE INDEX ix_crm_sale_payments_sale
  ON crm_sale_payments(sale_id, occurred_at, created_at);

ALTER TABLE crm_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sale_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_sale_payments_read_write ON crm_sale_payments
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
