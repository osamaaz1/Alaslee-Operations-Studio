// Verifies that public feedback stays unavailable until Supabase is configured.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.ADMIN_API_KEY = "";

let baseUrl;
let server;

before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("feedback reveals readiness without exposing Supabase configuration", async () => {
  const response = await fetch(`${baseUrl}/v1/feedback/status`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, { configured: false, maxImageBytes: 6 * 1024 * 1024 });
});

test("feedback reports do not fall back to local storage", async () => {
  const response = await fetch(`${baseUrl}/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "bug", priority: "high", title: "خطأ اختبار", description: "وصف كافٍ لاختبار تعطيل الإرسال المحلي." }),
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.match(body.errors[0].message, /Supabase/);
});
