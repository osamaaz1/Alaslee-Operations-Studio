// Performs one read-only Daftra fetch and stores it in the selected (normally temporary) CRM database.

import { migrateCrm } from "../src/infra/crm/migrations.js";
import { closeCrmPool } from "../src/infra/crm/postgres.js";
import { syncDaftra } from "../src/services/daftraSyncService.js";

try {
  await migrateCrm();
  const result = await syncDaftra();
  console.log(JSON.stringify(result));
  if (result.status !== "completed" || result.products < 1) throw new Error("Daftra did not return a usable product catalog.");
} finally {
  await closeCrmPool();
}
