-- Adds a staff-entered invoice number without reusing Daftra import references.
ALTER TABLE crm_sales
  ADD COLUMN invoice_number text;

CREATE UNIQUE INDEX ux_crm_sales_active_manual_invoice
  ON crm_sales (lower(invoice_number))
  WHERE record_type = 'manual_sale' AND status = 'posted' AND invoice_number IS NOT NULL;
