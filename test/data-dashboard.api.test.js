import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let baseUrl;
let closeDatabase;
let server;
let tempRoot;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "oe-dashboard-"));
  process.env.DATABASE_PATH = path.join(tempRoot, "products.sqlite");
  process.env.UPLOADS_DIR = path.join(tempRoot, "uploads");
  process.env.ALLOWED_IMPORT_ROOTS = tempRoot;
  process.env.ADMIN_API_KEY = "";
  process.env.RATE_LIMIT_MAX = "10000";
  process.env.CRM_SALLA_CLIENT_ID = "client";
  process.env.CRM_SALLA_REDIRECT_URI = "http://localhost/callback";
  process.env.CRM_SALLA_WEBHOOK_SECRET = "secret";

  const appModule = await import("../src/app.js");
  const databaseModule = await import("../src/db/database.js");
  closeDatabase = databaseModule.closeDatabase;
  server = appModule.createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  closeDatabase();
  await rm(tempRoot, { recursive: true, force: true });
});

test("dashboard profile endpoints render, preview, and save layouts", async () => {
  const profiles = await getJson("/v1/data/dashboard-profiles");
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, "default");

  const catalog = await getJson("/v1/data/widget-catalog");
  assert.equal(catalog.presets.some((preset) => preset.id === "table.unpaidInvoices"), true);

  const mergeRows = await getJson("/v1/data/product-merge?q=Spectra");
  assert.equal(mergeRows.rows.length > 0, true);
  assert.equal(Array.isArray(mergeRows.rows[0].sourceNames), true);

  const preview = await postJson("/v1/data/widgets/preview", {
    preset: "ranking.topCustomersRevenue",
    title: "Top customers",
    limit: 100,
    pageSize: 10,
  });
  assert.equal(preview.result.kind, "table");
  assert.equal(preview.result.visibleRows.length <= 10, true);

  const dashboard = await getJson("/v1/data/dashboard-profiles/default");
  assert.equal(dashboard.profile.id, "default");
  assert.equal(dashboard.widgets.length > 0, true);

  const layout = {
    version: 1,
    widgets: [preview.config],
  };
  const saved = await putJson("/v1/data/dashboard-profiles/default", { name: "Default", layout });
  assert.equal(saved.id, "default");

  const reloaded = await getJson("/v1/data/dashboard-profiles/default");
  assert.equal(reloaded.layout.widgets.length, 1);
  assert.equal(reloaded.widgets[0].config.preset, "ranking.topCustomersRevenue");
});

test("Salla status distinguishes app config from live connection", async () => {
  const status = await getJson("/v1/salla/status");
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.status, "not_connected");
  assert.equal(status.checks.some((check) => check.key === "accessToken" && check.ready === false), true);
});

async function getJson(url) {
  const response = await fetch(`${baseUrl}${url}`);
  return responseData(response);
}

async function postJson(url, payload) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return responseData(response);
}

async function putJson(url, payload) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return responseData(response);
}

async function responseData(response) {
  const body = await response.json();
  assert.equal(body.success, true, body.errors?.[0]?.message);
  assert.deepEqual(body.errors, []);
  assert.equal(response.ok, true);
  return body.data;
}
