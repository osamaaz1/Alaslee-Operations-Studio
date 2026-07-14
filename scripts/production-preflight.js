// Runs a secret-safe, read-only production readiness audit.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { config } from "../src/config.js";
import { runtimeConfigReport } from "../src/configValidation.js";
import { db, closeDatabase } from "../src/db/database.js";
import { closeCrmPool, getCrmPool } from "../src/infra/crm/postgres.js";
import { crmMigrationStatus } from "../src/infra/crm/migrations.js";
import { readinessStatus } from "../src/services/readinessService.js";

const startedAt = new Date().toISOString();
const failures = [];
const warnings = [];
const checks = {};

try {
  const configuration = runtimeConfigReport();
  checks.configuration = { ok: configuration.ok, production: configuration.production, provider: configuration.provider };
  failures.push(...configuration.errors.map((message) => `configuration: ${message}`));
  warnings.push(...configuration.warnings.map((message) => `configuration: ${message}`));
  if (!configuration.production) failures.push("configuration: NODE_ENV must be production.");

  checks.build = await checkBuild();
  if (!checks.build.ok) failures.push("build: client/dist/index.html is missing; run npm run build.");
  if (checks.build.javascriptBytes > 800_000) warnings.push("build: the main JavaScript payload is larger than 800 KB before gzip.");

  checks.brandingFiles = await checkBrandingFiles();
  for (const [name, status] of Object.entries(checks.brandingFiles)) {
    if (!status.ok) failures.push(`branding: ${name} is missing or unreadable.`);
  }

  checks.sqlite = sqliteStatus();
  if (!checks.sqlite.ok) failures.push("sqlite: integrity or foreign-key check failed.");

  checks.crm = await crmStatus();
  if (!checks.crm.connected) failures.push("crm: PostgreSQL is not connected.");
  if (checks.crm.privileged) failures.push("crm: the application database role still has elevated PostgreSQL privileges.");
  if (checks.crm.migrationCount < 8) failures.push("crm: not all required migrations are applied.");

  checks.readiness = await readinessStatus();
  if (!checks.readiness.ready) failures.push("readiness: one or more required production dependencies are not ready.");

  checks.secretHygiene = trackedSecretStatus();
  if (!checks.secretHygiene.ok) failures.push(`secrets: sensitive environment files are tracked by Git (${checks.secretHygiene.files.join(", ")}).`);
} catch (error) {
  failures.push(`preflight: ${error.message}`);
} finally {
  await closeCrmPool().catch(() => undefined);
  closeDatabase();
}

const report = {
  ok: failures.length === 0,
  startedAt,
  completedAt: new Date().toISOString(),
  failures,
  warnings,
  checks,
};
await fs.mkdir(path.join(config.rootDir, "diagnostics"), { recursive: true });
const reportPath = path.join(config.rootDir, "diagnostics", "production-preflight.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Production preflight: ${report.ok ? "PASS" : "FAIL"}`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const failure of failures) console.error(`ERROR: ${failure}`);
console.log(`Report: ${reportPath}`);
if (!report.ok) process.exitCode = 1;

async function checkBuild() {
  const indexPath = path.join(config.rootDir, "client", "dist", "index.html");
  if (!fsSync.existsSync(indexPath)) return { ok: false, javascriptBytes: 0 };
  const assetsDir = path.join(config.rootDir, "client", "dist", "assets");
  const entries = fsSync.existsSync(assetsDir) ? await fs.readdir(assetsDir, { withFileTypes: true }) : [];
  let javascriptBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    javascriptBytes += (await fs.stat(path.join(assetsDir, entry.name))).size;
  }
  return { ok: true, javascriptBytes };
}

async function checkBrandingFiles() {
  const entries = {
    background: config.branding.backgroundPath,
    logo: config.branding.logoPath,
    footer: config.branding.footerPath,
    priceLabelReference: config.branding.priceLabelReferencePath,
  };
  const result = {};
  for (const [name, filePath] of Object.entries(entries)) {
    try {
      const metadata = await sharp(filePath, { failOn: "error" }).metadata();
      result[name] = { ok: Boolean(metadata.width && metadata.height), width: metadata.width, height: metadata.height, format: metadata.format };
    } catch {
      result[name] = { ok: false };
    }
  }
  return result;
}

function sqliteStatus() {
  try {
    const quickCheck = db.pragma("quick_check", { simple: true });
    const foreignKeyErrors = db.pragma("foreign_key_check").length;
    const migrationCount = db.prepare("SELECT count(*) AS count FROM schema_migrations").get().count;
    return { ok: quickCheck === "ok" && foreignKeyErrors === 0, quickCheck, foreignKeyErrors, migrationCount };
  } catch {
    return { ok: false, quickCheck: "failed", foreignKeyErrors: null, migrationCount: null };
  }
}

async function crmStatus() {
  try {
    const pool = getCrmPool();
    const role = await pool.query("SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname=current_user");
    const migrations = await crmMigrationStatus();
    const row = role.rows[0] || {};
    return {
      connected: true,
      role: row.name,
      privileged: Boolean(row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolreplication),
      migrationCount: migrations.length,
      latestMigration: migrations.at(-1)?.id || null,
    };
  } catch {
    return { connected: false, privileged: null, migrationCount: 0, latestMigration: null };
  }
}

function trackedSecretStatus() {
  try {
    const output = execFileSync("git", ["ls-files", "--", ".env", "correct.env", "temp.env", "*.env.backup-*"], {
      cwd: config.rootDir, encoding: "utf8", windowsHide: true,
    });
    const files = output.split(/\r?\n/).filter(Boolean);
    return { ok: files.length === 0, files };
  } catch {
    return { ok: false, files: ["git-check-failed"] };
  }
}
