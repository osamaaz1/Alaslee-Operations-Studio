-- Creates protected customer, session, prescription, scoring, and audit records.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crm_schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm_customer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_ar text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system'
);

CREATE TABLE crm_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  phone_country char(2) NOT NULL,
  phone_cipher text NOT NULL,
  phone_hash char(64) NOT NULL UNIQUE,
  phone_last4 char(4) NOT NULL,
  has_whatsapp boolean NOT NULL DEFAULT true,
  whatsapp_cipher text,
  whatsapp_hash char(64),
  whatsapp_last4 char(4),
  identity_type text CHECK (identity_type IN ('national_id', 'iqama')),
  identity_cipher text,
  identity_hash char(64),
  identity_last4 char(4),
  birth_year smallint,
  source_id uuid NOT NULL REFERENCES crm_customer_sources(id),
  deleted_at timestamptz,
  deleted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  CHECK ((has_whatsapp = true) OR whatsapp_cipher IS NOT NULL),
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2200)
);

CREATE UNIQUE INDEX ux_crm_customers_identity_hash
  ON crm_customers(identity_hash) WHERE identity_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_crm_customers_name ON crm_customers(lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX ix_crm_customers_source ON crm_customers(source_id) WHERE deleted_at IS NULL;

CREATE TABLE crm_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES crm_customers(id) ON DELETE CASCADE,
  country_code char(2) NOT NULL DEFAULT 'SA' CHECK (country_code = 'SA'),
  address_cipher text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);

CREATE TABLE crm_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
  exam_date date NOT NULL DEFAULT current_date,
  prescription_cipher text NOT NULL,
  consent_at timestamptz NOT NULL,
  exceptional boolean NOT NULL DEFAULT false,
  exception_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX ix_crm_prescriptions_customer ON crm_prescriptions(customer_id, exam_date DESC);

CREATE TABLE crm_sessions (
  token_hash char(64) PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('staff', 'superuser')),
  csrf_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_crm_sessions_expiry ON crm_sessions(expires_at);

CREATE TABLE crm_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_crm_audit_entity ON crm_audit_events(entity_type, entity_id, created_at DESC);

CREATE TABLE crm_rfm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);

CREATE TABLE crm_rfm_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
  recency_score smallint NOT NULL CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score smallint NOT NULL CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score smallint NOT NULL CHECK (monetary_score BETWEEN 1 AND 5),
  segment_code text NOT NULL,
  segment_label_ar text NOT NULL,
  explanation_ar text NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);
CREATE INDEX ix_crm_rfm_customer ON crm_rfm_snapshots(customer_id, created_at DESC);

INSERT INTO crm_customer_sources(code, label_ar) VALUES
  ('whatsapp_campaign', 'حملة واتساب'),
  ('instagram_campaign', 'حملة إنستغرام'),
  ('meta_campaign', 'حملة ميتا'),
  ('in_store', 'عميل في المحل'),
  ('whatsapp_contact', 'عبر الواتساب'),
  ('referral', 'توصية من عميل'),
  ('other', 'أخرى')
ON CONFLICT (code) DO NOTHING;

INSERT INTO crm_rfm_rules(name, rules, created_by, updated_by)
SELECT 'القواعد الافتراضية', '{"recencyDays":[30,90,180,365],"frequency":[1,2,4,8],"monetary":[500,1500,5000,10000]}'::jsonb, 'system', 'system'
WHERE NOT EXISTS (SELECT 1 FROM crm_rfm_rules);
