# 0015: Superuser-only encrypted account vault

## Context

The store needs one place to manage credentials for social platforms and operational integrations. These credentials are highly sensitive and must not be accessible to staff users or included in ordinary API responses.

## Decision

- Store the login, secret, and notes as AES-256-GCM encrypted values using the existing CRM encryption key.
- Restrict every vault endpoint to the existing superuser session and CSRF protection.
- Enforce the same rule in PostgreSQL with a superuser-only RLS policy.
- Return secret-free list and detail responses. A separate `reveal` action returns one decrypted secret and writes a redacted audit event.
- Use soft deletion so an accidental removal remains traceable.

## Alternatives considered

- Plaintext database fields: rejected because database access would expose all credentials.
- Client-side encryption only: rejected because the server still needs a consistent protected storage boundary and key lifecycle.
- Staff access with masking: rejected because even masked credential metadata expands access unnecessarily.

## Consequences

The local CRM encryption key becomes essential for vault recovery, so key rotation must use the existing rotation procedure. The UI is useful only for a logged-in superuser; staff users receive no credential content.
