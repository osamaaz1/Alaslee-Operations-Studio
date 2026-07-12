-- Adds a superuser-only encrypted vault for store account credentials.
CREATE TABLE crm_account_vault_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL CHECK (provider_code IN ('facebook','instagram','tiktok','daftra','salla','google','other')),
  provider_label_ar text NOT NULL CHECK (char_length(provider_label_ar) BETWEEN 2 AND 80),
  account_label text NOT NULL CHECK (char_length(account_label) BETWEEN 2 AND 160),
  credential_kind text NOT NULL CHECK (credential_kind IN ('password','api_key','access_token','other')),
  login_cipher text,
  secret_cipher text NOT NULL,
  url text,
  notes_cipher text,
  deleted_at timestamptz,
  deleted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL
);

CREATE INDEX ix_crm_account_vault_active
  ON crm_account_vault_entries(provider_code, lower(account_label)) WHERE deleted_at IS NULL;

ALTER TABLE crm_account_vault_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_account_vault_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_account_vault_superuser_only ON crm_account_vault_entries
  USING (current_setting('app.crm_role', true) = 'superuser')
  WITH CHECK (current_setting('app.crm_role', true) = 'superuser');
