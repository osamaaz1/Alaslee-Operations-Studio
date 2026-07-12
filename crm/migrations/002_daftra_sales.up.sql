-- Creates read-only Daftra snapshots and protected manual sales.
CREATE TABLE daftra_products (
  external_id text PRIMARY KEY,
  product_code text,
  sku text,
  barcode text,
  name text NOT NULL,
  brand text,
  category text,
  unit_price numeric(14,2),
  minimum_price numeric(14,2),
  stock_balance numeric(14,3),
  track_stock boolean NOT NULL DEFAULT false,
  status text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'daftra-sync',
  updated_by text NOT NULL DEFAULT 'daftra-sync'
);
CREATE INDEX ix_daftra_products_search ON daftra_products(lower(name), product_code, barcode);

CREATE TABLE daftra_stores (
  external_id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'daftra-sync',
  updated_by text NOT NULL DEFAULT 'daftra-sync'
);

CREATE TABLE daftra_stock_transactions (
  external_id text PRIMARY KEY,
  product_id text NOT NULL,
  store_id text,
  quantity numeric(14,3) NOT NULL,
  transaction_type text,
  received_at timestamptz,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'daftra-sync',
  updated_by text NOT NULL DEFAULT 'daftra-sync'
);
CREATE INDEX ix_daftra_stock_product_store ON daftra_stock_transactions(product_id, store_id);

CREATE TABLE daftra_stock_levels (
  product_id text NOT NULL REFERENCES daftra_products(external_id) ON DELETE CASCADE,
  store_id text NOT NULL REFERENCES daftra_stores(external_id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY(product_id, store_id)
);

CREATE TABLE daftra_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  products_count integer NOT NULL DEFAULT 0,
  stores_count integer NOT NULL DEFAULT 0,
  transactions_count integer NOT NULL DEFAULT 0,
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'daftra-sync'
);
CREATE INDEX ix_daftra_sync_latest ON daftra_sync_runs(started_at DESC);

CREATE TABLE crm_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm_customers(id),
  record_type text NOT NULL DEFAULT 'manual_sale' CHECK (record_type IN ('manual_sale', 'imported_sale', 'imported_return')),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided', 'deleted')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(14,2) NOT NULL,
  warning_reason text,
  source_reference text,
  correction_of uuid REFERENCES crm_sales(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
  ,CHECK ((record_type = 'imported_return' AND total_amount <= 0) OR (record_type <> 'imported_return' AND total_amount >= 0))
);
CREATE INDEX ix_crm_sales_customer ON crm_sales(customer_id, occurred_at DESC);
CREATE INDEX ix_crm_sales_status ON crm_sales(status, occurred_at DESC);
CREATE UNIQUE INDEX ux_crm_sales_import_source ON crm_sales(source_reference) WHERE source_reference IS NOT NULL;

CREATE TABLE crm_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES crm_sales(id) ON DELETE CASCADE,
  daftra_product_id text NOT NULL,
  product_code text,
  sku text,
  product_name text NOT NULL,
  brand text,
  category text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  reference_price numeric(14,2) NOT NULL CHECK (reference_price >= 0),
  daftra_minimum_price numeric(14,2),
  applied_minimum_price numeric(14,2) NOT NULL CHECK (applied_minimum_price >= 0),
  minimum_source text NOT NULL CHECK (minimum_source IN ('daftra', 'fallback_50_percent')),
  stock_balance numeric(14,3),
  stock_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_synced_at timestamptz NOT NULL,
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX ix_crm_sale_items_sale ON crm_sale_items(sale_id);
CREATE INDEX ix_crm_sale_items_product ON crm_sale_items(daftra_product_id);

CREATE TABLE crm_sale_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES crm_sales(id),
  replacement_sale_id uuid REFERENCES crm_sales(id),
  action text NOT NULL CHECK (action IN ('edit', 'void', 'delete', 'restore')),
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);
CREATE INDEX ix_crm_sale_corrections_sale ON crm_sale_corrections(sale_id, created_at DESC);
