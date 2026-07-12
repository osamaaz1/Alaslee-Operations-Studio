# 0016: Private Supabase feedback boundary

## Context

All studio users need a low-friction way to report errors and suggestions, optionally with a screenshot. These reports must not be written to the local workstation database once Supabase is the chosen reporting destination.

## Decision

- Keep the Feedback widget available on every frontend page, without exposing any Supabase key to the browser.
- Send reports through the existing `/v1` server boundary only when `SUPABASE_URL` and a server-only Supabase key are configured.
- Store report metadata in `public.feedback_reports` and screenshot objects in a private `feedback-attachments` Storage bucket.
- Enable RLS on the report table with no browser policy; the server key performs the write. The browser receives no attachment URL.
- Make the CRM PostgreSQL URL fall back to `SUPABASE_DATABASE_URL` only when `CRM_DATABASE_URL` is absent. Existing SQLite operational data is not silently copied.

## Alternatives considered

- Browser-side Supabase client: rejected because it would expose privileged storage/write access and complicate anonymous reporting policies.
- Local feedback fallback: rejected because the requested source of truth is Supabase.
- Automatic SQLite-to-PostgreSQL copy at startup: rejected because it could duplicate or corrupt operational data without an explicit reviewed cutover.

## Consequences

The administrator performs the one-time SQL migration and sets the environment variables before reports can be sent. Moving CRM to Supabase PostgreSQL is configuration-compatible, but moving existing local SQLite data remains a separate, reviewed migration.
