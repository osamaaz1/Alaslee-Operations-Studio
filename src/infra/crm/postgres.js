// Owns the optional PostgreSQL pool and role-scoped CRM transactions.

import pg from "pg";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

const { Pool } = pg;
let pool;

export function crmConfigured() {
  return Boolean(config.crm.databaseUrl);
}

export function getCrmPool() {
  if (!crmConfigured()) throw new AppError("قاعدة بيانات العملاء غير مهيأة.", 503);
  if (!pool) {
    pool = new Pool({
      connectionString: config.crm.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
      application_name: "alaslee-crm",
    });
    pool.on("error", (error) => console.error("[crm-db] idle client error", error.message));
  }
  return pool;
}

export async function withCrmTransaction(actor, task) {
  const client = await getCrmPool().connect();
  try {
    await client.query("BEGIN");
    await setRequestContext(client, actor);
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setRequestContext(client, actor = {}) {
  const role = actor.role || "staff";
  const id = actor.id || role;
  await client.query("SELECT set_config('app.crm_role', $1, true)", [role]);
  await client.query("SELECT set_config('app.actor_id', $1, true)", [id]);
}

export async function crmDatabaseHealth() {
  if (!crmConfigured()) return { configured: false, connected: false };
  try {
    const result = await getCrmPool().query("SELECT now() AS now");
    return { configured: true, connected: true, checkedAt: result.rows[0].now };
  } catch (error) {
    console.error("[crm-db] health check failed", error.message);
    return {
      configured: true,
      connected: false,
      error: process.env.NODE_ENV === "production" ? "unavailable" : error.message,
    };
  }
}

export async function closeCrmPool() {
  if (pool) await pool.end();
  pool = undefined;
}
