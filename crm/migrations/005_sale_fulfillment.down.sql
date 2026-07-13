-- Removes sale payment and delivery tracking.
DROP POLICY IF EXISTS crm_sale_payments_read_write ON crm_sale_payments;
ALTER TABLE IF EXISTS crm_sale_payments DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS crm_sale_payments;
DROP INDEX IF EXISTS ix_crm_sales_delivery;
ALTER TABLE crm_sales
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS scheduled_delivery_at,
  DROP COLUMN IF EXISTS delivery_status,
  DROP COLUMN IF EXISTS payment_tracking_enabled;
