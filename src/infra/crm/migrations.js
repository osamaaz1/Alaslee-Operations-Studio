// Applies and rolls back ordered PostgreSQL CRM migration files.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { getCrmPool } from "./postgres.js";

const migrationsDir = path.join(config.rootDir, "crm", "migrations");

export async function migrateCrm() {
  const pool = getCrmPool();
  await ensureMigrationTable(pool);
  const files = await migrationFiles(".up.sql");
  const applied = await appliedIds(pool);
  const completed = [];
  for (const file of files) {
    const id = file.replace(".up.sql", "");
    if (applied.has(id)) continue;
    await applyFile(pool, id, file);
    completed.push(id);
  }
  return completed;
}

export async function rollbackCrm() {
  const pool = getCrmPool();
  await ensureMigrationTable(pool);
  const row = await pool.query("SELECT id FROM crm_schema_migrations ORDER BY applied_at DESC LIMIT 1");
  if (!row.rows[0]) return null;
  const id = row.rows[0].id;
  const file = `${id}.down.sql`;
  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM crm_schema_migrations WHERE id = $1", [id]);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function crmMigrationStatus() {
  const pool = getCrmPool();
  await ensureMigrationTable(pool);
  const result = await pool.query("SELECT id, applied_at FROM crm_schema_migrations ORDER BY applied_at");
  return result.rows;
}

async function ensureMigrationTable(queryable) {
  await queryable.query(`CREATE TABLE IF NOT EXISTS crm_schema_migrations (
    id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function migrationFiles(suffix) {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((file) => file.endsWith(suffix)).sort();
}

async function appliedIds(pool) {
  const result = await pool.query("SELECT id FROM crm_schema_migrations");
  return new Set(result.rows.map((row) => row.id));
}

async function applyFile(pool, id, file) {
  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO crm_schema_migrations(id) VALUES ($1)", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
