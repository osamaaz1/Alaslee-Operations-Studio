// Exercises the built production server without starting scheduled external writes.

import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { config } from "../src/config.js";
import { assertRuntimeConfig } from "../src/configValidation.js";
import { createApp } from "../src/app.js";
import { initializeCrmInfrastructure } from "../src/infra/crm/runtime.js";
import { closeCrmPool } from "../src/infra/crm/postgres.js";
import { closeDatabase } from "../src/db/database.js";

assertRuntimeConfig();
const crm = await initializeCrmInfrastructure();
if (!crm.ready) throw new Error("CRM failed to initialize for production smoke testing.");

const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const checks = [];

try {
  await check("liveness", "/health/live", 200, "application/json");
  await check("readiness", "/health/ready", 200, "application/json");
  await check("root SPA", "/", 200, "text/html");
  await check("nested SPA", "/crm/sales", 200, "text/html");
  await check("unknown API", "/v1/does-not-exist", 404, "application/json");
  await check("CRM authentication", "/v1/crm/sales", 401, "application/json");
  const cookie = await staffLogin();
  await checkAuthenticatedList("imported customers", "/v1/crm/customers?limit=5", cookie);
  await checkAuthenticatedList("Daftra products", "/v1/daftra/products?limit=5", cookie);
  await checkLocalApiLatency(cookie);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeCrmPool();
  closeDatabase();
}

const ok = checks.every((item) => item.ok);
const report = { ok, checkedAt: new Date().toISOString(), checks };
await fs.mkdir(path.join(config.rootDir, "diagnostics"), { recursive: true });
const reportPath = path.join(config.rootDir, "diagnostics", "production-http-smoke.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Production HTTP smoke: ${ok ? "PASS" : "FAIL"}`);
console.log(`Report: ${reportPath}`);
if (!ok) process.exitCode = 1;

async function check(name, pathname, expectedStatus, expectedType) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  const contentType = response.headers.get("content-type") || "";
  const securityHeaders = Boolean(response.headers.get("content-security-policy") && response.headers.get("x-content-type-options"));
  const ok = response.status === expectedStatus && contentType.includes(expectedType) && securityHeaders;
  checks.push({ name, ok, status: response.status, contentType, securityHeaders, durationMs: Math.round(performance.now() - started) });
}

async function staffLogin() {
  const response = await fetch(`${baseUrl}/v1/auth/pin`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ pin: config.crm.staffPin }),
  });
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  checks.push({ name: "staff login", ok: response.status === 200 && cookie.includes("alaslee_crm_session="), status: response.status });
  return cookie;
}

async function checkAuthenticatedList(name, pathname, cookie) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { cookie } });
  const body = await response.json().catch(() => null);
  const count = Array.isArray(body?.data) ? body.data.length : 0;
  checks.push({ name, ok: response.status === 200 && count > 0, status: response.status, count, durationMs: Math.round(performance.now() - started) });
}

async function checkLocalApiLatency(cookie) {
  const durations = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/v1/crm/customers?limit=20`, { headers: { cookie } });
    if (!response.ok) {
      checks.push({ name: "local API p95", ok: false, status: response.status });
      return;
    }
    await response.arrayBuffer();
    durations.push(performance.now() - started);
  }
  durations.sort((a, b) => a - b);
  const p95Ms = Math.round(durations[Math.ceil(durations.length * 0.95) - 1]);
  checks.push({ name: "local API p95", ok: p95Ms < 500, p95Ms, thresholdMs: 500 });
}
