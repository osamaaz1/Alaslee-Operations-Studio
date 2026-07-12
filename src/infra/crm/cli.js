// Provides local commands for CRM migration and connectivity operations.

import { closeCrmPool, crmDatabaseHealth } from "./postgres.js";
import { crmMigrationStatus, migrateCrm, rollbackCrm } from "./migrations.js";
import { rotateCrmEncryption } from "./encryptionRotation.js";

const command = process.argv[2] || "status";

try {
  if (command === "migrate") console.log("Applied:", await migrateCrm());
  else if (command === "rollback") console.log("Rolled back:", await rollbackCrm());
  else if (command === "rotate-encryption") console.log("Rotated:", await rotateCrmEncryption());
  else if (command === "status") console.log(await status());
  else throw new Error(`Unknown CRM command: ${command}`);
} finally {
  await closeCrmPool();
}

async function status() {
  const health = await crmDatabaseHealth();
  if (!health.connected) return { health, migrations: [] };
  return { health, migrations: await crmMigrationStatus() };
}
