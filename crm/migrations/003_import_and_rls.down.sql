-- Rolls back historical import review and CRM RLS policies.
DROP POLICY IF EXISTS crm_sale_items_read_write ON crm_sale_items;
DROP POLICY IF EXISTS crm_sales_read_write ON crm_sales;
DROP POLICY IF EXISTS crm_prescriptions_read_write ON crm_prescriptions;
DROP POLICY IF EXISTS crm_addresses_read_write ON crm_customer_addresses;
DROP POLICY IF EXISTS crm_customers_read_write ON crm_customers;
ALTER TABLE crm_sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prescriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customer_addresses DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customers DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS crm_merge_candidates;
DROP TABLE IF EXISTS crm_import_rows;
DROP TABLE IF EXISTS crm_import_batches;
