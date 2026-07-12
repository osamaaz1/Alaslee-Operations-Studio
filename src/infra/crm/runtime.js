// Initializes optional CRM migrations and reports readiness without blocking legacy features.

import { crmConfigured, crmDatabaseHealth } from "./postgres.js";
import { migrateCrm } from "./migrations.js";

export async function initializeCrmInfrastructure() {
  if (!crmConfigured()) return { configured: false, ready: false };
  try {
    const migrations = await migrateCrm();
    const health = await crmDatabaseHealth();
    return { configured: true, ready: health.connected, migrations };
  } catch (error) {
    console.error("[crm] initialization failed:", error.message);
    return { configured: true, ready: false, error: error.message };
  }
}
