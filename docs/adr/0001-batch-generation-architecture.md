<!-- Records the decision for local batch import and generation architecture. -->

# ADR 0001: Local Batch Generation Architecture

## Context

The current tool supports one uploaded product with role-based images. The new workflow must import many products from a local folder using filenames like `1-1.jpg`, `1-2.jpg`, and `2-1.jpg`, then generate square ecommerce and Instagram-ready outputs.

## Decision

Use the existing Express backend as the batch orchestrator. Add a versioned API, SQLite migration support, a batch table, and product metadata columns. Batch imports will read server-side folders only from configured import roots. Generation will remain sequential in the first implementation pass.

## Alternatives

- Browser-only folder upload: rejected because browsers do not expose stable local folder paths to JavaScript.
- Background worker queue: deferred until batch volume proves it is needed.
- New database engine: rejected because SQLite already matches the local desktop-style workflow.
