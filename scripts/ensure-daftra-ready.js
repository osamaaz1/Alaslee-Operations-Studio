// Refreshes a configured Daftra snapshot only when production readiness would reject it.

import { closeCrmPool } from "../src/infra/crm/postgres.js";
import { daftraConfigured } from "../src/services/daftraClient.js";
import { daftraSyncStatus, syncDaftra } from "../src/services/daftraSyncService.js";

try {
  if (!daftraConfigured()) {
    console.log(JSON.stringify({ status: "skipped", reason: "not-configured" }));
  } else {
    const before = await daftraSyncStatus();
    if (before.usable) {
      console.log(JSON.stringify({ status: "skipped", reason: "cache-usable", freshness: before.freshness }));
    } else {
      const sync = await syncDaftra();
      const after = sync.status === "already_running"
        ? await waitForUsableSnapshot()
        : await daftraSyncStatus();
      console.log(JSON.stringify({
        status: sync.status,
        products: sync.products,
        stores: sync.stores,
        transactions: sync.transactions,
        freshness: after.freshness,
        usable: after.usable,
      }));
      if (!after.usable) throw new Error("Daftra synchronization did not produce a usable product catalog.");
    }
  }
} finally {
  await closeCrmPool();
}

async function waitForUsableSnapshot(timeoutMilliseconds = 120_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let status = await daftraSyncStatus();
  while (!status.usable && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    status = await daftraSyncStatus();
  }
  return status;
}
