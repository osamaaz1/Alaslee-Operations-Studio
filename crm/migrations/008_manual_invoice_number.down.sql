DROP INDEX IF EXISTS ux_crm_sales_active_manual_invoice;

ALTER TABLE crm_sales
  DROP COLUMN IF EXISTS invoice_number;
