<!-- Documents the database schema, keys, indexes, and audit columns. -->

# Database Schema

## products

Primary key: `id`.

Foreign keys:
- `source_batch_id` references `batches.id` for batch-imported products.

Indexes:
- `idx_products_source_batch_id`
- `idx_products_source_product_code`
- `idx_products_status`

Audit columns:
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Output metadata:
- `output_stage`
- `output_kind`
- `is_mock`

## product_original_images

Primary key: `id`.

Foreign keys:
- `product_id` references `products.id`.

Unique keys:
- `UNIQUE(product_id, role)`

Indexes:
- implicit unique index on `(product_id, role)`

Audit columns:
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

## product_generated_images

Primary key: `id`.

Foreign keys:
- `product_id` references `products.id`.

Unique keys:
- `UNIQUE(product_id, role)`

Indexes:
- implicit unique index on `(product_id, role)`

Audit columns:
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

## product_instagram_images

Primary key: `id`.

Foreign keys:
- `product_id` references `products.id`.

Unique keys:
- `UNIQUE(product_id, role)`

Indexes:
- implicit unique index on `(product_id, role)`

Audit columns:
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Explicit Instagram metadata:
- `source_generated_image_id`
- `source_role`
- `profile_id`
- `product_sku`
- `product_price`
- `local_path`
- `price_label_reference_path`
- `price_label_provider`
- `price_label_model`
- `price_label_prompt`
- `provider_mode`
- `output_stage`
- `output_kind`
- `is_mock`
- `is_final`
- `status`
- `error_message`
- `completed_at`

## instagram_generation_attempts

Primary key: `id`.

Foreign keys:
- `product_id` references `products.id`.
- `source_generated_image_id` references `product_generated_images.id`.

Indexes:
- `idx_instagram_attempts_product`
- `idx_instagram_attempts_status`

Purpose:
- Tracks each selected Instagram generation item, including provider mode, local composition path, final GPT-labeled or Free Test preview output path, SKU, price, status, and errors.

## batches

Primary key: `id`.

Indexes:
- `idx_batches_status`
- `idx_batches_created_at`

Audit columns:
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

## schema_migrations

Primary key: `id`.

Purpose:
- Tracks applied database migrations.
