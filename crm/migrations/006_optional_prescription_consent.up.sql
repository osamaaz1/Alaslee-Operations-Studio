-- New prescriptions no longer request or record patient consent in this workflow.
ALTER TABLE crm_prescriptions ALTER COLUMN consent_at DROP NOT NULL;
