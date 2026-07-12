<!-- Records the decision for branded Instagram image generation. -->

# ADR 0002: Branding As Post-Processing

## Context

The tool must optionally create Instagram-ready variants with a company logo and a bottom footer overlay.

## Decision

Create branded variants with Sharp after AI gallery generation. Store branded image metadata separately in `product_instagram_images`.

## Alternatives

- Ask the AI provider to add branding: rejected because it is less consistent and increases generation cost.
- Merge branded variants into `product_generated_images`: rejected because ecommerce gallery images and Instagram variants have different lifecycle needs.
