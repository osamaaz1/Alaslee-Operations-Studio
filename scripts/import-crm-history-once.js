// Imports the configured analyzed customer data into the selected (normally temporary) CRM database.

import { migrateCrm } from "../src/infra/crm/migrations.js";
import { closeCrmPool } from "../src/infra/crm/postgres.js";
import { importCrmHistory } from "../src/services/crmHistoryImportService.js";

try {
  await migrateCrm();
  const result = await importCrmHistory({ id: "production-test", role: "superuser" }, "127.0.0.1");
  console.log(JSON.stringify({ status: result.status, customers: result.customers, sales: result.sales, reviewCandidates: result.reviewCandidates }));
  if (result.customers < 1) throw new Error("The analyzed customer data did not import any valid customer records.");
} finally {
  await closeCrmPool();
}
