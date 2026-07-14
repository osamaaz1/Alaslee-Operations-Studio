import { createApp } from "../src/app.js";
import { assertRuntimeConfig } from "../src/configValidation.js";
import { initializeCrmInfrastructure } from "../src/infra/crm/runtime.js";
import { closeCrmPool } from "../src/infra/crm/postgres.js";
import { closeDatabase } from "../src/db/database.js";

assertRuntimeConfig();
const crm = await initializeCrmInfrastructure();
if (!crm.ready) throw new Error("CRM is not ready for browser testing.");
const server = createApp().listen(3100, "127.0.0.1", () => console.log("E2E server ready on http://127.0.0.1:3100"));

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await closeCrmPool();
  closeDatabase();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
