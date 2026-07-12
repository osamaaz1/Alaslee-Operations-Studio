import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeCrmInfrastructure } from "./infra/crm/runtime.js";
import { startDaftraScheduler } from "./jobs/daftraScheduler.js";

const app = createApp();
const crm = await initializeCrmInfrastructure();
if (crm.ready) startDaftraScheduler();

app.listen(config.port, () => {
  console.log(`Alaslee Operations Studio API listening on http://localhost:${config.port}`);
  console.log(`[crm] ${crm.ready ? "ready" : crm.configured ? "unavailable" : "not configured"}`);
});
