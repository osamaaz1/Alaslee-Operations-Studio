// Exercises CRM auth, customers, sales, scoring, and audit against PostgreSQL.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

const databaseUrl = process.env.CRM_TEST_DATABASE_URL;
let baseUrl;
let closeCrmPool;
let getCrmPool;
let server;
let staff;
let superuser;

before(async () => {
  if (!databaseUrl) return;
  process.env.CRM_DATABASE_URL = databaseUrl;
  process.env.CRM_DATA_ENCRYPTION_KEY = process.env.CRM_TEST_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.CRM_STAFF_PIN = "2468";
  process.env.CRM_SUPERUSER_PIN = "8642";
  const { migrateCrm } = await import("../src/infra/crm/migrations.js");
  ({ closeCrmPool, getCrmPool } = await import("../src/infra/crm/postgres.js"));
  const { createApp } = await import("../src/app.js");
  await migrateCrm();
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  staff = await login("2468");
  superuser = await login("8642");
});

after(async () => {
  if (!databaseUrl) return;
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (closeCrmPool) await closeCrmPool();
});

test("CRM creates encrypted customers and enforces staff/superuser boundaries", { skip: !databaseUrl }, async () => {
  const suffix = String(Date.now()).slice(-7);
  const customer = await request("/v1/crm/customers", {
    method: "POST", auth: staff,
    body: { name: "عميل اختبار", primaryPhone: { countryCode: "SA", number: `055${suffix}` }, hasWhatsapp: true,
      sourceCode: "in_store", birthYear: 1990, prescription: {
        consent: true, right: { sph: -1, cyl: -0.5, axis: 90 }, left: { sph: 0, cyl: 0 }, pdMode: "binocular", binocularPd: 62,
      } },
  });
  assert.equal(customer.name, "عميل اختبار");
  assert.equal(customer.prescriptions.length, 1);

  const batchId = await insertReviewCandidate(suffix);
  const candidates = await request("/v1/crm/imports/candidates", { auth: superuser });
  const candidate = candidates.find((item) => item.batch_id === batchId);
  assert.ok(candidate);
  await request(`/v1/crm/imports/candidates/${candidate.id}/decision`, {
    method: "POST", auth: superuser, body: { status: "separate" },
  });
  const batch = await getCrmPool().query("SELECT status FROM crm_import_batches WHERE id=$1", [batchId]);
  assert.equal(batch.rows[0].status, "completed");

  const forbidden = await rawRequest(`/v1/crm/customers/${customer.id}`, { method: "DELETE", auth: staff });
  assert.equal(forbidden.status, 403);
  const removed = await request(`/v1/crm/customers/${customer.id}`, { method: "DELETE", auth: superuser });
  assert.equal(removed.deleted, true);
  await request(`/v1/crm/customers/${customer.id}/restore`, { method: "POST", auth: superuser, body: {} });

  await insertProduct(`test-${suffix}`);
  const sale = await request("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: { customerId: customer.id, warningReason: "تمت مراجعة الحد المؤقت", items: [{ productId: `test-${suffix}`, quantity: 1, unitPrice: 750 }] },
  });
  assert.equal(Number(sale.total_amount), 750);
  assert.equal(sale.items[0].minimum_source, "fallback_50_percent");

  const belowFloor = await rawRequest("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: { customerId: customer.id, warningReason: "اختبار", items: [{ productId: `test-${suffix}`, quantity: 1, unitPrice: 400 }] },
  });
  assert.equal(belowFloor.status, 422);
  const corrected = await request(`/v1/crm/sales/${sale.id}/corrections`, {
    method: "POST", auth: superuser, body: { action: "void", reason: "اختبار صلاحية المشرف" },
  });
  assert.equal(corrected.original.status, "voided");
});

test("superuser account vault encrypts secrets and excludes staff", { skip: !databaseUrl }, async () => {
  const suffix = String(Date.now()).slice(-7);
  const secret = `vault-secret-${suffix}`;
  const entry = await request("/v1/accounts", {
    method: "POST", auth: superuser,
    body: { providerCode: "instagram", accountLabel: `حساب اختبار ${suffix}`, credentialKind: "password",
      login: "owner@example.com", secret, url: "https://instagram.com", notes: "ملاحظة اختبار" },
  });
  assert.equal(entry.login, "owner@example.com");
  assert.equal(Object.hasOwn(entry, "secret"), false);

  const list = await request("/v1/accounts", { auth: superuser });
  assert.equal(Object.hasOwn(list.find((item) => item.id === entry.id), "secret"), false);
  const forbidden = await rawRequest("/v1/accounts", { auth: staff });
  assert.equal(forbidden.status, 403);
  assert.equal(await vaultCipher(entry.id).then((value) => value.includes(secret)), false);

  const revealed = await request(`/v1/accounts/${entry.id}/reveal`, { method: "POST", auth: superuser, body: {} });
  assert.equal(revealed.secret, secret);
  const removed = await request(`/v1/accounts/${entry.id}`, { method: "DELETE", auth: superuser });
  assert.equal(removed.deleted, true);
});

async function login(pin) {
  const response = await fetch(`${baseUrl}/v1/auth/pin`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, body.errors?.[0]?.message);
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((item) => item.startsWith("alaslee_crm_session="))?.split(";")[0];
  return { cookie: session, csrf: body.data.csrfToken };
}

async function request(path, options = {}) {
  const response = await rawRequest(path, options);
  const body = await response.json();
  assert.equal(response.ok, true, body.errors?.[0]?.message);
  assert.equal(body.success, true);
  assert.deepEqual(body.errors, []);
  return body.data;
}

async function rawRequest(path, { method = "GET", body, auth } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) { headers.Cookie = auth.cookie; headers["x-csrf-token"] = auth.csrf; }
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function insertProduct(id) {
  await getCrmPool().query(
    `INSERT INTO daftra_products(external_id,product_code,sku,name,unit_price,minimum_price,stock_balance,track_stock,status,synced_at)
     VALUES($1,$2,$2,'إطار اختبار',1000,NULL,5,true,'active',now()) ON CONFLICT(external_id) DO NOTHING`, [id, `SKU-${id}`],
  );
}

async function insertReviewCandidate(suffix) {
  const batch = await getCrmPool().query(
    `INSERT INTO crm_import_batches(status,source_path,created_by,updated_by)
     VALUES('review','test','integration-test','integration-test') RETURNING id`,
  );
  await getCrmPool().query(
    `INSERT INTO crm_merge_candidates(batch_id,source_key,confidence,evidence,created_by,updated_by)
     VALUES($1,$2,0,$3::jsonb,'integration-test','integration-test')`,
    [batch.rows[0].id, `review-${suffix}`, JSON.stringify({ name: "سجل للمراجعة", reason: "رقم غير صالح" })],
  );
  return batch.rows[0].id;
}

async function vaultCipher(id) {
  const client = await getCrmPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.crm_role', 'superuser', true)");
    const result = await client.query("SELECT secret_cipher FROM crm_account_vault_entries WHERE id=$1", [id]);
    await client.query("ROLLBACK");
    return result.rows[0].secret_cipher;
  } finally {
    client.release();
  }
}
