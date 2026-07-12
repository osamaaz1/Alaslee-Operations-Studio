# ADR 0012: CRM PostgreSQL Boundary

## Context

The studio already stores image-production metadata in SQLite. The new CRM stores identity, contact, optical, purchase, scoring, and Daftra snapshot data and must later move to hosted Supabase without changing frontend contracts.

## Decision

- Preserve the existing SQLite workflows unchanged.
- Store only CRM and Daftra synchronization data in PostgreSQL.
- Keep React isolated from persistence behind versioned Express services.
- Use UUIDs, JSONB, timestamptz, PostgreSQL RLS, and reversible SQL migrations compatible with a future Supabase project.
- Encrypt sensitive values in the application before storage and use HMAC search tokens for exact matching.

## Alternatives

- Migrating the whole studio to PostgreSQL was rejected because it increases risk without helping the CRM release.
- Continuing with SQLite was rejected because it would defer PostgreSQL/RLS compatibility and create a later data-model rewrite.

## Consequences

The development environment runs two data stores. CRM routes return an explicit unavailable state when PostgreSQL is not configured, while existing image and campaign routes continue to operate.
