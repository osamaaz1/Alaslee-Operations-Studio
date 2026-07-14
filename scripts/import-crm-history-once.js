// Imports the configured analyzed customer data into the selected (normally temporary) CRM database.

import { migrateCrm } from "../src/infra/crm/migrations.js";
import { closeCrmPool, getCrmPool } from "../src/infra/crm/postgres.js";
import { importCrmHistory } from "../src/services/crmHistoryImportService.js";

try {
  await migrateCrm();
  const previousImport = await getCrmPool().query("SELECT id FROM crm_import_batches LIMIT 1");
  if (previousImport.rowCount > 0) {
    console.log(JSON.stringify({ status: "skipped", reason: "history-already-imported" }));
    process.exitCode = 0;
  } else {
    const result = await importCrmHistory({ id: "startup-history-import", role: "superuser" }, "127.0.0.1");
    console.log(JSON.stringify({ status: result.status, customers: result.customers, sales: result.sales, reviewCandidates: result.reviewCandidates }));
    if (result.customers < 1) throw new Error("The analyzed customer data did not import any valid customer records.");
  }
} finally {
  await closeCrmPool();
}
