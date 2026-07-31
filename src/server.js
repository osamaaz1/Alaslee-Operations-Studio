// Boots the API, CRM infrastructure, and read-only Daftra scheduler.
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeCrmInfrastructure } from "./infra/crm/runtime.js";
import { startDaftraScheduler } from "./jobs/daftraScheduler.js";
import { stopDaftraScheduler } from "./jobs/daftraScheduler.js";
import { assertRuntimeConfig } from "./configValidation.js";
import { closeCrmPool } from "./infra/crm/postgres.js";
import { closeDatabase } from "./db/database.js";
import { timingSafeEqual } from "node:crypto";
import net from "node:net";
import os from "node:os";

const report = assertRuntimeConfig();
for (const warning of report.warnings) console.warn(`[config] ${warning}`);
const app = createApp();
let crm = await initializeCrmInfrastructure();
if (crm.ready) startDaftraScheduler();

const server = app.listen(config.port, config.host, () => {
  console.log(`Alaslee Operations Studio API listening on http://localhost:${config.port}`);
  for (const url of lanUrls(config.port)) console.log(`[lan] ${url}`);
  console.log(`[crm] ${crm.ready ? "ready" : crm.configured ? "unavailable" : "not configured"}`);
});

let stopping = false;
let serviceControlServer;
let crmRecoveryTimer;
if (crm.configured && !crm.ready) scheduleCrmRecovery();

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[shutdown] ${signal}`);
  if (crmRecoveryTimer) clearTimeout(crmRecoveryTimer);
  const failures = [];
  const schedulerStop = stopDaftraScheduler().catch((error) => failures.push(error));
  const serviceControlClose = closeServer(serviceControlServer).catch((error) => failures.push(error));
  await closeHttpServer(server).catch((error) => failures.push(error));
  await schedulerStop;
  await closeCrmPool().catch((error) => failures.push(error));
  try { closeDatabase(); } catch (error) { failures.push(error); }
  await serviceControlClose;
  if (failures.length) throw new AggregateError(failures, "Production shutdown did not complete cleanly.");
}

function requestShutdown(signal, exitCode = 0) {
  shutdown(signal).then(
    () => { process.exitCode = exitCode; },
    (error) => {
      console.error("[shutdown]", error);
      process.exitCode = 1;
    },
  );
}

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
  process.once(signal, () => requestShutdown(signal));
}

serviceControlServer = startServiceControlServer();

function startServiceControlServer() {
  const pipeName = String(process.env.ALASLEE_SERVICE_PIPE || "").trim();
  const expectedToken = String(process.env.ALASLEE_SERVICE_TOKEN || "");
  if (!pipeName && !expectedToken) return undefined;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(pipeName) || expectedToken.length < 32) {
    throw new Error("The Windows service control channel is invalid.");
  }

  const control = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.setTimeout(5_000, () => socket.destroy());
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk;
      if (input.length > 1_024) return socket.destroy();
      const newline = input.indexOf("\n");
      if (newline === -1) return;
      const token = input.slice(0, newline).trim();
      if (!tokensMatch(token, expectedToken)) return socket.destroy();
      socket.end("OK\n");
      setImmediate(() => requestShutdown("WINDOWS_SERVICE_STOP"));
    });
    socket.on("error", () => undefined);
  });
  control.maxConnections = 4;
  control.on("error", (error) => {
    console.error("[service-control]", error.message);
    requestShutdown("SERVICE_CONTROL_FAILURE", 1);
  });
  control.listen(`\\\\.\\pipe\\${pipeName}`, () => console.log("[service-control] ready"));
  control.unref();
  return control;
}

function tokensMatch(provided, expected) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function closeServer(instance) {
  if (!instance?.listening) return Promise.resolve();
  return new Promise((resolve) => instance.close(resolve));
}

function closeHttpServer(instance, graceMilliseconds = 15_000) {
  if (!instance.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const forceTimer = setTimeout(() => {
      console.warn("[shutdown] closing remaining HTTP connections after the grace period");
      instance.closeAllConnections?.();
    }, graceMilliseconds);
    forceTimer.unref?.();
    instance.close((error) => {
      clearTimeout(forceTimer);
      if (error) reject(error); else resolve();
    });
    instance.closeIdleConnections?.();
  });
}

function scheduleCrmRecovery(attempt = 0) {
  const delay = Math.min(60_000, 5_000 * (2 ** Math.min(attempt, 4)));
  crmRecoveryTimer = setTimeout(async () => {
    if (stopping) return;
    const recovered = await initializeCrmInfrastructure();
    if (stopping) return;
    if (recovered.ready) {
      crm = recovered;
      crmRecoveryTimer = undefined;
      startDaftraScheduler();
      console.log("[crm] recovered after startup");
      return;
    }
    scheduleCrmRecovery(attempt + 1);
  }, delay);
  crmRecoveryTimer.unref?.();
}

function lanUrls(port) {
  const urls = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (/docker|vEthernet|wsl|vpn|loopback/i.test(name)) continue;
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal && isPrivateIpv4(address.address)) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

function isPrivateIpv4(value) {
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
