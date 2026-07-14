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
  const customerPayload = {
    name: "عميل اختبار", primaryPhone: { countryCode: "SA", number: `055${suffix}` }, hasWhatsapp: true,
    sourceCode: "in_store", birthYear: 1990, prescription: {
      right: { sph: -1, cyl: -0.5, axis: 90 }, left: { sph: 0, cyl: 0 }, pdMode: "binocular", binocularPd: 62,
    },
  };
  const customer = await request("/v1/crm/customers", {
    method: "POST", auth: staff,
    body: customerPayload,
  });
  assert.equal(customer.name, "عميل اختبار");
  assert.equal(customer.prescriptions.length, 1);
  assert.equal(Object.hasOwn(customer.prescriptions[0], "consent_at"), false);

  const duplicate = await rawRequest("/v1/crm/customers", { method: "POST", auth: staff, body: customerPayload });
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.errors[0].details.code, "customer_phone_exists");
  assert.equal(duplicateBody.errors[0].details.customerId, customer.id);

  const customerWithNewPrescription = await request(`/v1/crm/customers/${customer.id}/prescriptions`, {
    method: "POST", auth: staff,
    body: { right: { sph: -30, cyl: -7, axis: 180, add: 6 }, left: { sph: 0, cyl: 0 }, pdMode: "binocular", binocularPd: 63 },
  });
  assert.equal(customerWithNewPrescription.prescriptions.length, 2);
  assert.equal(Object.hasOwn(customerWithNewPrescription.prescriptions[0], "consent_at"), false);

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
  const scheduledDeliveryAt = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const sale = await request("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: {
      invoiceNumber: `TEST-${suffix}`,
      customerId: customer.id, warningReason: "تمت مراجعة الحد المؤقت",
      initialPaidAmount: 200, deliveryMode: "scheduled", scheduledDeliveryAt,
      items: [{ productId: `test-${suffix}`, quantity: 2, unitPrice: 750 }],
    },
  });
  assert.equal(Number(sale.total_amount), 1500);
  assert.equal(sale.invoice_number, `TEST-${suffix}`);
  assert.equal(sale.items[0].minimum_source, "fallback_50_percent");
  assert.equal(sale.delivery_status, "pending");
  assert.equal(sale.scheduled_delivery_at, scheduledDeliveryAt);
  assert.equal(Number(sale.paid_amount), 200);
  assert.equal(Number(sale.remaining_amount), 1300);

  const productsWhileReserved = await request("/v1/daftra/products?availableOnly=1", { auth: staff });
  const reservedProduct = productsWhileReserved.find((item) => item.external_id === `test-${suffix}`);
  assert.equal(Number(reservedProduct.reserved_quantity), 2);
  assert.equal(Number(reservedProduct.available_quantity), 3);

  const duplicateInvoice = await rawRequest("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: { invoiceNumber: `test-${suffix}`, customerId: customer.id, warningReason: "اختبار التكرار", items: [{ productId: `test-${suffix}`, quantity: 1, unitPrice: 750 }] },
  });
  const duplicateInvoiceBody = await duplicateInvoice.json();
  assert.equal(duplicateInvoice.status, 409);
  assert.equal(duplicateInvoiceBody.errors[0].details.code, "sale_invoice_exists");

  const oversold = await rawRequest("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: { invoiceNumber: `OVER-${suffix}`, customerId: customer.id, warningReason: "اختبار الحجز", items: [{ productId: `test-${suffix}`, quantity: 4, unitPrice: 750 }] },
  });
  assert.equal(oversold.status, 422);

  const paid = await request(`/v1/crm/sales/${sale.id}/payments`, {
    method: "POST", auth: staff, body: { amount: 300 },
  });
  assert.equal(Number(paid.paid_amount), 500);
  assert.equal(paid.payment_status, "partially_paid");
  const overpayment = await rawRequest(`/v1/crm/sales/${sale.id}/payments`, {
    method: "POST", auth: staff, body: { amount: 1001 },
  });
  assert.equal(overpayment.status, 422);
  const staffRefund = await rawRequest(`/v1/crm/sales/${sale.id}/refunds`, {
    method: "POST", auth: staff, body: { amount: 500, reason: "رد اختباري" },
  });
  assert.equal(staffRefund.status, 403);
  const refunded = await request(`/v1/crm/sales/${sale.id}/refunds`, {
    method: "POST", auth: superuser, body: { amount: 500, reason: "رد اختباري كامل" },
  });
  assert.equal(Number(refunded.paid_amount), 0);
  assert.equal(refunded.payment_status, "refunded");

  const ready = await request(`/v1/crm/sales/${sale.id}/delivery`, {
    method: "PUT", auth: staff, body: { status: "ready", scheduledDeliveryAt },
  });
  assert.equal(ready.delivery_status, "ready");

  const agenda = await request("/v1/crm/sales/agenda", { auth: staff });
  const readyAgendaSale = agenda.buckets.ready.sales.find((item) => item.id === sale.id);
  assert.ok(readyAgendaSale);
  assert.equal(readyAgendaSale.customer_phone, customer.primaryPhone.e164);
  assert.equal(readyAgendaSale.invoice_number, `TEST-${suffix}`);
  assert.equal(readyAgendaSale.items[0].product_name, "إطار اختبار");
  assert.equal(Number(readyAgendaSale.remaining_amount), 1500);

  const belowFloor = await rawRequest("/v1/crm/sales", {
    method: "POST", auth: staff,
    body: { invoiceNumber: `LOW-${suffix}`, customerId: customer.id, warningReason: "اختبار", items: [{ productId: `test-${suffix}`, quantity: 1, unitPrice: 400 }] },
  });
  assert.equal(belowFloor.status, 422);
  const corrected = await request(`/v1/crm/sales/${sale.id}/corrections`, {
    method: "POST", auth: superuser,
    body: {
      action: "edit", reason: "اختبار تعديل الطلب المحجوز",
      replacement: {
        invoiceNumber: `TEST-${suffix}`,
        customerId: customer.id, warningReason: "تمت مراجعة الحد المؤقت",
        deliveryMode: "scheduled", scheduledDeliveryAt,
        items: [{ productId: `test-${suffix}`, quantity: 2, unitPrice: 750 }],
      },
    },
  });
  assert.equal(corrected.original.status, "voided");
  assert.equal(corrected.original.delivery_status, "cancelled");
  assert.equal(corrected.replacement.delivery_status, "pending");

  const delivered = await request(`/v1/crm/sales/${corrected.replacement.id}/delivery`, {
    method: "PUT", auth: staff, body: { status: "delivered", scheduledDeliveryAt },
  });
  assert.equal(delivered.delivery_status, "delivered");
  const productsAfterDelivery = await request("/v1/daftra/products?availableOnly=1", { auth: staff });
  const releasedProduct = productsAfterDelivery.find((item) => item.external_id === `test-${suffix}`);
  assert.equal(Number(releasedProduct.reserved_quantity), 0);
  assert.equal(Number(releasedProduct.available_quantity), 5);
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
