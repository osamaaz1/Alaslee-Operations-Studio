// Owns SQLite connection setup, base schema creation, and migration execution.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config.js";
import { runMigrations } from "./migrations.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    source_folder TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    branding_enabled INTEGER NOT NULL DEFAULT 0,
    total_products INTEGER NOT NULL DEFAULT 0,
    successful_products INTEGER NOT NULL DEFAULT 0,
    failed_products INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    provider TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    source_product_code TEXT,
    source_batch_id TEXT,
    source_folder TEXT,
    input_mode TEXT NOT NULL DEFAULT 'single_upload',
    branding_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system',
    generated_at TEXT,
    error_message TEXT,
    generation_include_model INTEGER NOT NULL DEFAULT 0,
    generation_model_gender TEXT,
    generation_started_at TEXT,
    generation_current_role TEXT,
    generation_expected_count INTEGER NOT NULL DEFAULT 3,
    FOREIGN KEY(source_batch_id) REFERENCES batches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS product_original_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    role TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source_filename TEXT,
    source_path TEXT,
    source_mime_type TEXT,
    source_size_bytes INTEGER,
    source_width INTEGER,
    source_height INTEGER,
    optimization_applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system',
    UNIQUE(product_id, role),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS product_generated_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    role TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    provider TEXT NOT NULL,
    prompt TEXT NOT NULL,
    output_stage TEXT NOT NULL DEFAULT 'output_1',
    output_kind TEXT NOT NULL DEFAULT 'real_ai',
    is_mock INTEGER NOT NULL DEFAULT 0,
    generation_duration_ms INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system',
    UNIQUE(product_id, role),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS product_instagram_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    role TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source_generated_image_id INTEGER,
    source_role TEXT,
    profile_id TEXT,
    product_sku TEXT,
    product_price TEXT,
    local_path TEXT,
    price_label_reference_path TEXT,
    price_label_provider TEXT,
    price_label_model TEXT,
    price_label_prompt TEXT,
    provider_mode TEXT,
    output_stage TEXT NOT NULL DEFAULT 'output_2',
    output_kind TEXT NOT NULL DEFAULT 'final_ai',
    is_mock INTEGER NOT NULL DEFAULT 0,
    is_final INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system',
    UNIQUE(product_id, role),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS instagram_generation_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    source_generated_image_id INTEGER NOT NULL,
    source_role TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    product_sku TEXT NOT NULL,
    product_price TEXT NOT NULL,
    local_path TEXT,
    final_path TEXT,
    price_label_reference_path TEXT,
    price_label_provider TEXT,
    price_label_model TEXT,
    price_label_prompt TEXT,
    provider_mode TEXT,
    output_kind TEXT,
    is_mock INTEGER NOT NULL DEFAULT 0,
    is_final INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(source_generated_image_id) REFERENCES product_generated_images(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS data_dashboard_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_default INTEGER NOT NULL DEFAULT 0,
    layout_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system'
  );
`);

runMigrations(db);

export function closeDatabase() {
  if (db.open) {
    db.close();
  }
}
