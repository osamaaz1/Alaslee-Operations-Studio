// Applies versioned SQLite schema changes and exposes rollback support.

const SYSTEM_ACTOR = "system";

const migrations = [
  {
    id: "202607040001_batches_and_product_metadata",
    up(db) {
      addColumn(db, "products", "source_product_code", "TEXT");
      addColumn(db, "products", "source_batch_id", "TEXT");
      addColumn(db, "products", "source_folder", "TEXT");
      addColumn(db, "products", "input_mode", "TEXT NOT NULL DEFAULT 'single_upload'");
      addColumn(db, "products", "branding_enabled", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "products", "created_by", `TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}'`);
      addColumn(db, "products", "updated_by", `TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}'`);
      addAuditColumns(db, "product_original_images");
      addAuditColumns(db, "product_generated_images");

      db.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_products_source_batch_id
          ON products(source_batch_id);
        CREATE INDEX IF NOT EXISTS idx_products_source_product_code
          ON products(source_product_code);
        CREATE INDEX IF NOT EXISTS idx_products_status
          ON products(status);
        CREATE INDEX IF NOT EXISTS idx_batches_status
          ON batches(status);
        CREATE INDEX IF NOT EXISTS idx_batches_created_at
          ON batches(created_at);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_batches_created_at;
        DROP INDEX IF EXISTS idx_batches_status;
        DROP INDEX IF EXISTS idx_products_status;
        DROP INDEX IF EXISTS idx_products_source_product_code;
        DROP INDEX IF EXISTS idx_products_source_batch_id;
        DROP TABLE IF EXISTS batches;
      `);
    },
  },
  {
    id: "202607040002_product_instagram_images",
    up(db) {
      db.exec(`
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
          created_at TEXT NOT NULL,
          updated_at TEXT,
          created_by TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}',
          updated_by TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}',
          UNIQUE(product_id, role),
          FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        );
      `);
    },
    down(db) {
      db.exec("DROP TABLE IF EXISTS product_instagram_images;");
    },
  },
  {
    id: "202607050001_explicit_instagram_generation_metadata",
    up(db) {
      addColumn(db, "product_instagram_images", "source_generated_image_id", "INTEGER");
      addColumn(db, "product_instagram_images", "source_role", "TEXT");
      addColumn(db, "product_instagram_images", "profile_id", "TEXT");
      addColumn(db, "product_instagram_images", "product_sku", "TEXT");
      addColumn(db, "product_instagram_images", "product_price", "TEXT");
      addColumn(db, "product_instagram_images", "local_path", "TEXT");
      addColumn(db, "product_instagram_images", "price_label_reference_path", "TEXT");
      addColumn(db, "product_instagram_images", "price_label_provider", "TEXT");
      addColumn(db, "product_instagram_images", "price_label_model", "TEXT");
      addColumn(db, "product_instagram_images", "price_label_prompt", "TEXT");
      addColumn(db, "product_instagram_images", "status", "TEXT NOT NULL DEFAULT 'completed'");
      addColumn(db, "product_instagram_images", "error_message", "TEXT");
      addColumn(db, "product_instagram_images", "completed_at", "TEXT");
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_product_instagram_source_image
          ON product_instagram_images(source_generated_image_id);
        CREATE INDEX IF NOT EXISTS idx_product_instagram_status
          ON product_instagram_images(status);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_product_instagram_status;
        DROP INDEX IF EXISTS idx_product_instagram_source_image;
      `);
    },
  },
  {
    id: "202607050002_instagram_generation_attempts",
    up(db) {
      db.exec(`
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
          status TEXT NOT NULL,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY(source_generated_image_id) REFERENCES product_generated_images(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_instagram_attempts_product
          ON instagram_generation_attempts(product_id);
        CREATE INDEX IF NOT EXISTS idx_instagram_attempts_status
          ON instagram_generation_attempts(status);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_instagram_attempts_status;
        DROP INDEX IF EXISTS idx_instagram_attempts_product;
        DROP TABLE IF EXISTS instagram_generation_attempts;
      `);
    },
  },
  {
    id: "202607070001_output_stage_provider_metadata",
    up(db) {
      addColumn(db, "product_generated_images", "output_stage", "TEXT NOT NULL DEFAULT 'output_1'");
      addColumn(db, "product_generated_images", "output_kind", "TEXT NOT NULL DEFAULT 'real_ai'");
      addColumn(db, "product_generated_images", "is_mock", "INTEGER NOT NULL DEFAULT 0");

      addColumn(db, "product_instagram_images", "provider_mode", "TEXT");
      addColumn(db, "product_instagram_images", "output_stage", "TEXT NOT NULL DEFAULT 'output_2'");
      addColumn(db, "product_instagram_images", "output_kind", "TEXT NOT NULL DEFAULT 'final_ai'");
      addColumn(db, "product_instagram_images", "is_mock", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "product_instagram_images", "is_final", "INTEGER NOT NULL DEFAULT 1");

      addColumn(db, "instagram_generation_attempts", "provider_mode", "TEXT");
      addColumn(db, "instagram_generation_attempts", "output_kind", "TEXT");
      addColumn(db, "instagram_generation_attempts", "is_mock", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "instagram_generation_attempts", "is_final", "INTEGER NOT NULL DEFAULT 1");

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_generated_output_stage
          ON product_generated_images(output_stage);
        CREATE INDEX IF NOT EXISTS idx_instagram_provider_mode
          ON product_instagram_images(provider_mode);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_instagram_provider_mode;
        DROP INDEX IF EXISTS idx_generated_output_stage;
      `);
    },
  },
  {
    id: "202607080001_data_dashboard_profiles",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS data_dashboard_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          is_default INTEGER NOT NULL DEFAULT 0,
          layout_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          created_by TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}',
          updated_by TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}'
        );

        CREATE INDEX IF NOT EXISTS idx_data_dashboard_profiles_default
          ON data_dashboard_profiles(is_default);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_data_dashboard_profiles_default;
        DROP TABLE IF EXISTS data_dashboard_profiles;
      `);
    },
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of migrations) {
    applyMigration(db, migration);
  }
}

export function rollbackLastMigration(db) {
  const applied = db.prepare(`
    SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1
  `).get();

  if (!applied) return false;

  const migration = migrations.find((item) => item.id === applied.id);
  if (!migration) return false;

  db.transaction(() => {
    migration.down(db);
    db.prepare("DELETE FROM schema_migrations WHERE id = ?").run(migration.id);
  })();

  return true;
}

function applyMigration(db, migration) {
  const row = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.id);
  if (row) return;

  db.transaction(() => {
    migration.up(db);
    db.prepare(`
      INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)
    `).run(migration.id, new Date().toISOString());
  })();
}

function addColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function addAuditColumns(db, tableName) {
  addColumn(db, tableName, "updated_at", "TEXT");
  db.prepare(`UPDATE ${tableName} SET updated_at = created_at WHERE updated_at IS NULL`).run();
  addColumn(db, tableName, "created_by", `TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}'`);
  addColumn(db, tableName, "updated_by", `TEXT NOT NULL DEFAULT '${SYSTEM_ACTOR}'`);
}
