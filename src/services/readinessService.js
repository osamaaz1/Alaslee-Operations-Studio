// Reports production liveness and dependency readiness without exposing secrets.

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { config } from "../config.js";
import { db } from "../db/database.js";
import { normalizeProviderName } from "../domain/providers.js";
import { crmDatabaseHealth } from "../infra/crm/postgres.js";
import { daftraConfigured } from "./daftraClient.js";
import { daftraSyncStatus } from "./daftraSyncService.js";
import { getBrandingAssetStatus } from "./brandingAssetService.js";

export function livenessStatus() {
  return { ok: true, uptimeSeconds: Math.floor(process.uptime()), checkedAt: new Date().toISOString() };
}

export async function readinessStatus() {
  const [crm, branding, storage, workspace, sqlite] = await Promise.all([
    safeCheck(() => crmDatabaseHealth(), { configured: false, connected: false }),
    safeCheck(() => getBrandingAssetStatus(), { ready: false, priceLabelReady: false }),
    pathCheck(config.uploadsDir, fsConstants.R_OK | fsConstants.W_OK),
    pathCheck(config.dataWorkspaceDir, fsConstants.R_OK),
    sqliteCheck(),
  ]);
  const daftra = await daftraCheck(crm.connected);
  const provider = normalizeProviderName(config.aiProvider);
  const ai = {
    provider,
    configured: provider === "gpt" ? Boolean(config.openai.apiKey) : provider === "gemini" ? Boolean(config.gemini.apiKey) : true,
    testMode: provider === "free-test",
  };
  const checks = {
    crm: Boolean(crm.configured && crm.connected),
    sqlite: sqlite.ok,
    uploads: storage.ok,
    dataWorkspace: workspace.ok,
    branding: Boolean(branding.ready && branding.priceLabelReferenceReady),
    ai: ai.configured,
    daftra: daftra.required ? daftra.usable : true,
  };
  return {
    ready: Object.values(checks).every(Boolean), checkedAt: new Date().toISOString(), checks,
    crm: { configured: crm.configured, connected: crm.connected },
    sqlite, storage, workspace, ai, branding, daftra,
  };
}

async function sqliteCheck() {
  try {
    const quickCheck = db.pragma("quick_check", { simple: true });
    const foreignKeys = db.pragma("foreign_key_check");
    return { ok: quickCheck === "ok" && foreignKeys.length === 0, quickCheck, foreignKeyErrors: foreignKeys.length };
  } catch {
    return { ok: false, quickCheck: "failed", foreignKeyErrors: null };
  }
}

async function pathCheck(target, mode) {
  try {
    const stat = await fs.stat(target);
    await fs.access(target, mode);
    return { ok: stat.isDirectory() };
  } catch {
    return { ok: false };
  }
}

async function daftraCheck(crmConnected) {
  const required = daftraConfigured();
  if (!required) return { required: false, configured: false, usable: false, freshness: "not_configured" };
  if (!crmConnected) return { required: true, configured: true, usable: false, freshness: "unavailable" };
  const status = await safeCheck(() => daftraSyncStatus(), { usable: false, freshness: "unavailable" });
  return { required: true, configured: true, usable: Boolean(status.usable), freshness: status.freshness, counts: status.counts };
}

async function safeCheck(task, fallback) {
  try {
    return await task();
  } catch {
    return fallback;
  }
}
