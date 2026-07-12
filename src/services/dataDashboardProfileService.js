// Persists customizable Data workspace dashboard profiles.

import crypto from "node:crypto";
import { db } from "../db/database.js";
import { AppError } from "../utils/errors.js";
import {
  defaultDashboardLayout,
  normalizeDashboardLayout,
  renderDashboardLayout,
} from "./dataWorkspaceService.js";

const defaultProfileId = "default";

export async function listDashboardProfiles() {
  ensureDefaultProfile();
  return db
    .prepare("SELECT id, name, is_default, created_at, updated_at FROM data_dashboard_profiles ORDER BY is_default DESC, name ASC")
    .all()
    .map(profileSummary);
}

export async function getDashboardProfile(profileId = defaultProfileId, options = {}) {
  ensureDefaultProfile();
  const profile = readProfile(profileId);
  const rendered = await renderDashboardLayout(profile.layout, { query: options.query });

  return {
    profile: profileSummary(profile),
    layout: profile.layout,
    ...rendered,
  };
}

export function createDashboardProfile(input = {}) {
  ensureDefaultProfile();
  const name = cleanName(input.name || "New dashboard");
  const layout = normalizeDashboardLayout(input.layout || defaultDashboardLayout);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO data_dashboard_profiles
      (id, name, is_default, layout_json, created_at, updated_at, created_by, updated_by)
    VALUES
      (?, ?, 0, ?, ?, ?, 'system', 'system')
  `).run(id, name, JSON.stringify(layout), now, now);

  return profileSummary(readProfile(id));
}

export function updateDashboardProfile(profileId, input = {}) {
  ensureDefaultProfile();
  const existing = readProfile(profileId);
  const name = input.name === undefined ? existing.name : cleanName(input.name);
  const layout = input.layout === undefined ? existing.layout : normalizeDashboardLayout(input.layout);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE data_dashboard_profiles
    SET name = ?, layout_json = ?, updated_at = ?, updated_by = 'system'
    WHERE id = ?
  `).run(name, JSON.stringify(layout), now, profileId);

  return profileSummary(readProfile(profileId));
}

export function ensureDefaultProfile() {
  const existing = db.prepare("SELECT id FROM data_dashboard_profiles WHERE id = ?").get(defaultProfileId);
  if (existing) return;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO data_dashboard_profiles
      (id, name, is_default, layout_json, created_at, updated_at, created_by, updated_by)
    VALUES
      (?, 'Default', 1, ?, ?, ?, 'system', 'system')
  `).run(defaultProfileId, JSON.stringify(normalizeDashboardLayout(defaultDashboardLayout)), now, now);
}

function readProfile(profileId) {
  const row = db.prepare("SELECT * FROM data_dashboard_profiles WHERE id = ?").get(String(profileId || defaultProfileId));
  if (!row) throw new AppError("Dashboard profile not found.", 404);
  return {
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    layout: parseLayout(row.layout_json),
  };
}

function parseLayout(value) {
  try {
    return normalizeDashboardLayout(JSON.parse(value));
  } catch {
    return normalizeDashboardLayout(defaultDashboardLayout);
  }
}

function profileSummary(row) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault ?? Boolean(row.is_default),
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
  };
}

function cleanName(value) {
  const name = String(value || "").trim();
  if (!name) throw new AppError("Dashboard profile name is required.", 400);
  if (name.length > 80) throw new AppError("Dashboard profile name must be 80 characters or fewer.", 400);
  return name;
}
