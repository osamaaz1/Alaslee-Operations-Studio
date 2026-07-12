# CRM PostgreSQL Schema

The CRM schema is owned by ordered SQL migrations under `crm/migrations`. The current studio SQLite schema is not changed.

## Main records

- `crm_customer_sources` classifies acquisition channels.
- `crm_customers` holds non-sensitive profile fields plus encrypted phone/identity values and exact-match hashes.
- `crm_customer_addresses` holds one encrypted Saudi national address per customer.
- `crm_prescriptions` holds encrypted, consented, versioned optical measurements.
- `crm_sales` and `crm_sale_items` preserve posted manual purchases and their Daftra price/stock snapshots.
- `crm_rfm_rules` and `crm_rfm_snapshots` explain customer classification over time.
- `daftra_products`, `daftra_stores`, `daftra_stock_transactions`, and `daftra_stock_levels` form the read-only local catalog.
- `daftra_sync_runs` records synchronization health and watermarks.
- `crm_import_batches` and `crm_merge_candidates` control historical import review.
- `crm_sessions` and `crm_audit_events` support local access control and traceability.

## Integrity

- UUID primary keys are generated with `gen_random_uuid()`.
- Base business tables contain `created_at`, `updated_at`, `created_by`, and `updated_by`.
- Customer deletion is soft by default; sales preserve status and correction history.
- Phone and identity uniqueness use HMAC hashes rather than plaintext.
- Foreign keys use restricted or cascading deletion only where ownership is unambiguous.
- List and matching paths have dedicated indexes to prevent N+1 scans.

## Supabase compatibility

Types and policies use PostgreSQL features supported by Supabase. Browser code never connects directly to this local database; later migration replaces connection/auth configuration while keeping `/v1` contracts stable.
