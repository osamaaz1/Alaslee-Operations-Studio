# ADR: Explicit Instagram Price Label Workflow

## Context

Instagram outputs were previously derived automatically after ecommerce product generation. The production workflow now requires the operator to choose which generated ecommerce images should become Instagram images, provide Price and SKU once per product, select an output profile, and run Instagram generation as a final explicit step.

The existing Brand Kit and Sharp compositor remain the source of truth for campaign background, product placement, logo, footer artwork, shadow, opacity, and saved per-profile layout settings.

## Decision

Instagram generation is split into two backend stages:

1. Local Sharp composition creates a branded intermediate image from the selected ecommerce source image and saved Brand Kit/profile settings.
2. OpenAI image editing receives the local composed image plus a price-label reference image and is instructed to add only the price label.

The frontend only sends selected generated image IDs, profile ID, and per-product Price/SKU metadata. OpenAI calls remain backend-only. SKU is required metadata but is not inserted into the image prompt or final visual output.

Metadata for attempts and final outputs is stored in SQLite, including source image, profile, SKU, price, local intermediate path, final output path, provider/model metadata, timestamps, status, and error information.

## Alternatives

- Keep automatic Instagram generation after ecommerce generation. Rejected because operators need explicit source-image selection, per-product pricing, and final approval timing.
- Ask OpenAI to create the full Instagram image directly. Rejected because Brand Kit composition already exists locally and must remain visually stable.
- Add SKU to the rendered design. Rejected because the current requirement makes SKU metadata-only unless a future design explicitly introduces it.
