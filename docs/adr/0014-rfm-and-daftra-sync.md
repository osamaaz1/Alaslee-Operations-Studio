# ADR 0014: Explainable RFM and Read-only Daftra Sync

## Context

Customer value must update from purchases without exposing health data to an AI provider. Product details, prices, and stock come from Daftra, while CRM sales must not alter Daftra inventory.

## Decision

- Use editable deterministic recency, frequency, and monetary rules with stored score snapshots.
- Exclude prescriptions and voided/deleted sales from scoring.
- Read products, stores, and processed stock transactions from Daftra every hour and persist local snapshots.
- Select product metadata from snapshots during a sale and store the exact values used.
- Never write CRM sales or stock changes back to Daftra.

## Alternatives

- LLM classification was rejected because it is less explainable and would expand personal-data processing.
- Live Daftra calls inside the sale form were rejected because latency and API outages would block local work.

## Consequences

The UI must show freshness and reconciliation warnings. Hourly synchronization is idempotent and guarded by a PostgreSQL advisory lock.
