# ADR 0013: Shared Staff PIN, Superuser PIN, and Audit

## Context

The local deployment requires a simple staff entry experience and one privileged owner. Customer identity and optical prescription data require stronger controls than the existing optional write API key.

## Decision

- Use separate staff and superuser PINs supplied only through environment variables.
- Hash PIN comparisons with Node scrypt and never persist plaintext PINs.
- Store opaque session hashes in PostgreSQL and issue HttpOnly, SameSite=Strict cookies.
- Require the superuser role for corrections, deletes, imports, rule changes, and manual synchronization.
- Preserve immutable, redacted audit events for all sensitive reads and writes.

## Alternatives

- Named employee accounts remain a future option but are outside the selected local model.
- An open local UI was rejected because the CRM holds personal and health data.

## Consequences

Staff actions share one audit actor rather than an individual employee identity. The schema keeps actor identifiers so named accounts can be introduced later without rewriting business records.
