// Boots the API, CRM infrastructure, and read-only Daftra scheduler.
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeCrmInfrastructure } from "./infra/crm/runtime.js";
import { startDaftraScheduler } from "./jobs/daftraScheduler.js";
import { stopDaftraScheduler } from "./jobs/daftraScheduler.js";
import { assertRuntimeConfig } from "./configValidation.js";
import { closeCrmPool } from "./infra/crm/postgres.js";
import { closeDatabase } from "./db/database.js";
import os from "node:os";

const report = assertRuntimeConfig();
for (const warning of report.warnings) console.warn(`[config] ${warning}`);
const app = createApp();
const crm = await initializeCrmInfrastructure();
if (crm.ready) startDaftraScheduler();

const server = app.listen(config.port, config.host, () => {
  console.log(`Alaslee Operations Studio API listening on http://localhost:${config.port}`);
  for (const url of lanUrls(config.port)) console.log(`[lan] ${url}`);
  console.log(`[crm] ${crm.ready ? "ready" : crm.configured ? "unavailable" : "not configured"}`);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[shutdown] ${signal}`);
  stopDaftraScheduler();
  await new Promise((resolve) => server.close(resolve));
  await closeCrmPool();
  closeDatabase();
}

process.on("SIGINT", () => shutdown("SIGINT").finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown("SIGTERM").finally(() => process.exit(0)));

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
