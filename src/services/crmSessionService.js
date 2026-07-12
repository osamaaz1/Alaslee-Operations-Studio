// Authenticates local CRM PINs and persists opaque role-aware sessions.

import crypto from "node:crypto";
import { config } from "../config.js";
import { getCrmPool } from "../infra/crm/postgres.js";
import { AppError } from "../utils/errors.js";

const sessionBytes = 32;

export async function createCrmSession(pin) {
  const role = matchingRole(pin);
  if (!role) throw new AppError("رمز الدخول غير صحيح.", 401);
  const token = crypto.randomBytes(sessionBytes).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + config.crm.sessionHours * 60 * 60 * 1000);
  await getCrmPool().query(
    `INSERT INTO crm_sessions(token_hash, role, csrf_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [hash(token), role, hash(csrfToken), expiresAt],
  );
  return { token, csrfToken, role, expiresAt };
}

export async function readCrmSession(token) {
  if (!token) return null;
  const result = await getCrmPool().query(
    `UPDATE crm_sessions SET last_seen_at = now()
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING role, csrf_hash, expires_at`,
    [hash(token)],
  );
  const row = result.rows[0];
  return row ? { id: row.role, role: row.role, csrfHash: row.csrf_hash, expiresAt: row.expires_at } : null;
}

export async function destroyCrmSession(token) {
  if (token) await getCrmPool().query("DELETE FROM crm_sessions WHERE token_hash = $1", [hash(token)]);
}

export function validCsrf(session, token) {
  if (!session?.csrfHash || !token) return false;
  return safeEqual(session.csrfHash, hash(token));
}

function matchingRole(pin) {
  const candidate = String(pin || "");
  if (!/^\d{4,12}$/.test(candidate)) return null;
  if (matchesPin(candidate, config.crm.superuserPin, "superuser")) return "superuser";
  if (matchesPin(candidate, config.crm.staffPin, "staff")) return "staff";
  return null;
}

function matchesPin(candidate, configured, role) {
  if (!configured) return false;
  return safeEqual(pinDigest(candidate, role), pinDigest(configured, role));
}

function pinDigest(pin, role) {
  return crypto.scryptSync(String(pin), `alaslee:${role}:crm-pin`, 32).toString("hex");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
