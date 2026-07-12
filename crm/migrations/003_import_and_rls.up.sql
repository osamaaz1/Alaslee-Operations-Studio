-- Adds historical import review and PostgreSQL row-level permissions.
CREATE TABLE crm_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'review', 'completed', 'failed')),
  source_path text NOT NULL,
  customers_count integer NOT NULL DEFAULT 0,
  sales_count integer NOT NULL DEFAULT 0,
  candidates_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);

CREATE TABLE crm_merge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES crm_import_batches(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  candidate_customer_id uuid REFERENCES crm_customers(id),
  confidence numeric(5,2) NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'separate', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  UNIQUE(batch_id, source_key, candidate_customer_id)
);
CREATE INDEX ix_crm_merge_pending ON crm_merge_candidates(batch_id, status);

CREATE TABLE crm_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES crm_import_batches(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_key text NOT NULL,
  source_payload jsonb NOT NULL,
  target_customer_id uuid REFERENCES crm_customers(id),
  target_sale_id uuid REFERENCES crm_sales(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE(batch_id, source_type, source_key)
);
CREATE INDEX ix_crm_import_rows_customer ON crm_import_rows(target_customer_id);

ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customer_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prescriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sale_items FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_customers_read_write ON crm_customers
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
CREATE POLICY crm_addresses_read_write ON crm_customer_addresses
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
CREATE POLICY crm_prescriptions_read_write ON crm_prescriptions
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
CREATE POLICY crm_sales_read_write ON crm_sales
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
CREATE POLICY crm_sale_items_read_write ON crm_sale_items
  USING (current_setting('app.crm_role', true) IN ('staff', 'superuser'))
  WITH CHECK (current_setting('app.crm_role', true) IN ('staff', 'superuser'));
