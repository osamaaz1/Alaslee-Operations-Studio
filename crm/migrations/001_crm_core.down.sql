-- Rolls back customer, session, prescription, scoring, and audit records.
DROP TABLE IF EXISTS crm_rfm_snapshots;
DROP TABLE IF EXISTS crm_rfm_rules;
DROP TABLE IF EXISTS crm_audit_events;
DROP TABLE IF EXISTS crm_sessions;
DROP TABLE IF EXISTS crm_prescriptions;
DROP TABLE IF EXISTS crm_customer_addresses;
DROP TABLE IF EXISTS crm_customers;
DROP TABLE IF EXISTS crm_customer_sources;
