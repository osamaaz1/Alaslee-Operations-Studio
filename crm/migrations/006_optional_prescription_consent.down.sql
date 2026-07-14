UPDATE crm_prescriptions SET consent_at = COALESCE(consent_at, created_at, now()) WHERE consent_at IS NULL;
ALTER TABLE crm_prescriptions ALTER COLUMN consent_at SET NOT NULL;
