// Synchronizes read-only Daftra catalog and stock snapshots into PostgreSQL.

import { getCrmPool } from "../infra/crm/postgres.js";
import { daftraConfigured, fetchDaftraProducts, fetchDaftraStores, fetchDaftraTransactions } from "./daftraClient.js";

const advisoryLockId = 734_519;

export async function syncDaftra() {
  if (!daftraConfigured()) return { configured: false, status: "not_configured" };
  const client = await getCrmPool().connect();
  let runId;
  try {
    const locked = await tryLock(client);
    if (!locked) return { configured: true, status: "already_running" };
    runId = await startRun(client);
    const dateFrom = await transactionDateFrom(client);
    const [products, stores, transactions] = await Promise.all([
      fetchDaftraProducts(), fetchDaftraStores(), fetchDaftraTransactions(dateFrom),
    ]);
    const syncedAt = new Date().toISOString();
    await client.query("BEGIN");
    await upsertProducts(client, products, syncedAt);
    await upsertStores(client, stores, syncedAt);
    await upsertTransactions(client, transactions, syncedAt);
    await rebuildStockLevels(client, syncedAt);
    await completeRun(client, runId, products.length, stores.length, transactions.length, dateFrom);
    await client.query("COMMIT");
    return { configured: true, status: "completed", products: products.length, stores: stores.length, transactions: transactions.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (runId) await failRun(client, runId, error.message).catch(() => undefined);
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]).catch(() => undefined);
    client.release();
  }
}

export async function daftraSyncStatus() {
  const [latestResult, completedResult, countsResult] = await Promise.all([
    getCrmPool().query(
      `SELECT id,status,started_at,completed_at,products_count,stores_count,transactions_count,error_message,details
       FROM daftra_sync_runs ORDER BY started_at DESC LIMIT 1`,
    ),
    getCrmPool().query(
      `SELECT id,status,started_at,completed_at,products_count,stores_count,transactions_count
       FROM daftra_sync_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1`,
    ),
    getCrmPool().query(
      `SELECT (SELECT count(*)::int FROM daftra_products) AS products,
              (SELECT count(*)::int FROM daftra_stores) AS stores,
              (SELECT count(*)::int FROM daftra_stock_transactions) AS transactions`,
    ),
  ]);
  const latest = latestResult.rows[0] || null;
  const lastCompleted = completedResult.rows[0] || null;
  const counts = countsResult.rows[0] || { products: 0, stores: 0, transactions: 0 };
  const currentFreshness = freshness(lastCompleted?.completed_at);
  return {
    configured: daftraConfigured(), latest, lastCompleted, counts, freshness: currentFreshness,
    usable: Boolean(lastCompleted && counts.products > 0 && currentFreshness !== "expired"),
  };
}

async function tryLock(client) {
  const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [advisoryLockId]);
  return result.rows[0].locked;
}

async function startRun(client) {
  const result = await client.query(
    "INSERT INTO daftra_sync_runs(status,started_at) VALUES('running',now()) RETURNING id",
  );
  return result.rows[0].id;
}

async function transactionDateFrom(client) {
  const result = await client.query(
    "SELECT completed_at FROM daftra_sync_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1",
  );
  const completed = result.rows[0]?.completed_at;
  if (!completed) return undefined;
  const overlap = new Date(new Date(completed).getTime() - 86_400_000);
  return overlap.toISOString().slice(0, 10);
}

async function upsertProducts(client, rows, syncedAt) {
  const values = rows.map((row) => ({
    external_id: String(row.id), product_code: text(row.product_code), sku: text(row.product_code),
    barcode: text(row.barcode), name: text(row.name) || `منتج ${row.id}`, brand: text(row.brand),
    category: categoryName(row), unit_price: decimal(row.unit_price), minimum_price: nullableDecimal(row.minimum_price),
    stock_balance: decimal(row.stock_balance), track_stock: Boolean(row.track_stock), status: text(row.status),
    raw_data: row, synced_at: syncedAt,
  }));
  await jsonUpsert(client, "daftra_products", values, [
    "external_id", "product_code", "sku", "barcode", "name", "brand", "category", "unit_price",
    "minimum_price", "stock_balance", "track_stock", "status", "raw_data", "synced_at",
  ], "external_id");
}

async function upsertStores(client, rows, syncedAt) {
  const values = rows.map((row) => ({
    external_id: String(row.id), name: text(row.name) || `مستودع ${row.id}`,
    active: String(row.status ?? "1") !== "0", raw_data: row, synced_at: syncedAt,
  }));
  await jsonUpsert(client, "daftra_stores", values, ["external_id", "name", "active", "raw_data", "synced_at"], "external_id");
}

async function upsertTransactions(client, rows, syncedAt) {
  const values = rows.filter((row) => row.id != null && row.product_id != null).map((row) => ({
    external_id: String(row.id), product_id: String(row.product_id), store_id: row.store_id == null ? null : String(row.store_id),
    quantity: decimal(row.quantity), transaction_type: text(row.transaction_type), received_at: dateValue(row.received_date),
    raw_data: row, synced_at: syncedAt,
  }));
  await jsonUpsert(client, "daftra_stock_transactions", values, [
    "external_id", "product_id", "store_id", "quantity", "transaction_type", "received_at", "raw_data", "synced_at",
  ], "external_id");
}

async function jsonUpsert(client, table, rows, columns, conflictColumn) {
  if (!rows.length) return;
  const select = columns.map((column) => castExpression(column)).join(",");
  const updates = columns.filter((column) => column !== conflictColumn).map((column) => `${column}=EXCLUDED.${column}`).join(",");
  await client.query(
    `INSERT INTO ${table}(${columns.join(",")}) SELECT ${select} FROM jsonb_array_elements($1::jsonb) item
     ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updates}, updated_at=now()`,
    [JSON.stringify(rows)],
  );
}

function castExpression(column) {
  const numeric = new Set(["unit_price", "minimum_price", "stock_balance", "quantity"]);
  if (column === "raw_data") return "item->'raw_data'";
  if (column === "track_stock" || column === "active") return `(item->>'${column}')::boolean`;
  if (numeric.has(column)) return `NULLIF(item->>'${column}','')::numeric`;
  if (column.endsWith("_at")) return `NULLIF(item->>'${column}','')::timestamptz`;
  return `item->>'${column}'`;
}

async function rebuildStockLevels(client, syncedAt) {
  await client.query("DELETE FROM daftra_stock_levels");
  await client.query(
    `INSERT INTO daftra_stock_levels(product_id,store_id,quantity,synced_at)
     SELECT t.product_id,t.store_id,COALESCE(SUM(t.quantity),0),$1
     FROM daftra_stock_transactions t JOIN daftra_products p ON p.external_id=t.product_id
     JOIN daftra_stores s ON s.external_id=t.store_id WHERE t.store_id IS NOT NULL GROUP BY t.product_id,t.store_id`,
    [syncedAt],
  );
}

async function completeRun(client, id, products, stores, transactions, dateFrom) {
  await client.query(
    `UPDATE daftra_sync_runs SET status='completed',completed_at=now(),products_count=$2,stores_count=$3,
     transactions_count=$4,details=$5::jsonb WHERE id=$1`,
    [id, products, stores, transactions, JSON.stringify({ dateFrom })],
  );
}

async function failRun(client, id, message) {
  await client.query("UPDATE daftra_sync_runs SET status='failed',completed_at=now(),error_message=$2 WHERE id=$1", [id, String(message).slice(0, 500)]);
}

function freshness(completedAt) {
  if (!completedAt) return "missing";
  const minutes = (Date.now() - new Date(completedAt).getTime()) / 60_000;
  if (minutes > 1_440) return "expired";
  if (minutes > 75) return "stale";
  return "fresh";
}

function categoryName(row) { return text(row.category || row.ProductCategory?.[0]?.name); }
function text(value) { return value == null ? null : String(value).trim() || null; }
function decimal(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableDecimal(value) { if (value === null || value === undefined || value === "") return null; return decimal(value); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null; }
