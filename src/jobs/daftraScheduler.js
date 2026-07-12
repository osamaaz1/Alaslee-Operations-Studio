// Runs idempotent Daftra synchronization on the configured hourly cadence.

import { config } from "../config.js";
import { crmConfigured } from "../infra/crm/postgres.js";
import { daftraConfigured } from "../services/daftraClient.js";
import { syncDaftra } from "../services/daftraSyncService.js";

let timer;

export function startDaftraScheduler() {
  if (timer || !crmConfigured() || !daftraConfigured()) return false;
  const interval = Math.max(15, config.daftra.syncMinutes) * 60_000;
  const run = () => syncDaftra().catch((error) => console.error("[daftra-sync]", error.message));
  timer = setInterval(run, interval);
  timer.unref?.();
  run();
  return true;
}

export function stopDaftraScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
