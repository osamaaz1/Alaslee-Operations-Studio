// Runs idempotent Daftra synchronization on the configured hourly cadence.

import { config } from "../config.js";
import { crmConfigured } from "../infra/crm/postgres.js";
import { daftraConfigured } from "../services/daftraClient.js";
import { syncDaftra } from "../services/daftraSyncService.js";

let timer;
let activeRun;
let activeController;

export function startDaftraScheduler() {
  if (timer || !crmConfigured() || !daftraConfigured()) return false;
  const interval = Math.max(15, config.daftra.syncMinutes) * 60_000;
  const run = () => {
    if (activeRun) return activeRun;
    const controller = new AbortController();
    activeController = controller;
    const operation = syncDaftra({ signal: controller.signal }).catch((error) => {
      if (!controller.signal.aborted) console.error("[daftra-sync]", error.message);
    });
    const tracked = operation.finally(() => {
      if (activeRun === tracked) activeRun = undefined;
      if (activeController === controller) activeController = undefined;
    });
    activeRun = tracked;
    return tracked;
  };
  timer = setInterval(run, interval);
  timer.unref?.();
  run();
  return true;
}

export async function stopDaftraScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
  const running = activeRun;
  activeController?.abort();
  if (running) await running;
}
