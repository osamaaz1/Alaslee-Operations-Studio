// Produces a secret-safe configuration report and blocks unsafe production starts.

import fs from "node:fs";
import { config } from "./config.js";
import { normalizeProviderName } from "./domain/providers.js";

export function runtimeConfigReport() {
  const errors = [];
  const warnings = [];
  const production = config.environment === "production";
  const provider = normalizeProviderName(config.aiProvider);

  if (!new Set(["gemini", "gpt", "free-test"]).has(provider)) {
    errors.push("AI_PROVIDER must be gemini, gpt, or free-test.");
  }
  if (production && provider === "free-test") {
    errors.push("AI_PROVIDER=free-test is reserved for testing and cannot be used for production startup.");
  }
  if (!new Set(["developer", "agent-platform"]).has(config.gemini.apiMode)) {
    errors.push('GEMINI_API_MODE must be "developer" or "agent-platform".');
  }
  if (provider === "gemini" && !config.gemini.apiKey) errors.push("GEMINI_API_KEY is required for the selected provider.");
  if (provider === "gpt" && !config.openai.apiKey) errors.push("OPENAI_API_KEY is required for the selected provider.");

  validateCrm(errors, warnings);
  validateUrl("PUBLIC_BASE_URL", config.publicBaseUrl, errors);
  validateUrl("LOCAL_DEV_CLIENT_ORIGIN", config.localDevClientOrigin, errors);

  if (production && !config.publicBaseUrl) {
    warnings.push("PUBLIC_BASE_URL is empty; URLs will follow the current request host for dynamic LAN access.");
  }
  if (production && config.publicBaseUrl?.startsWith("http://") && config.crm.secureCookie) {
    errors.push("CRM_SECURE_COOKIE must be false when production is intentionally served over HTTP.");
  }
  if (production && !config.security.adminApiKey) {
    warnings.push("Non-CRM tools are intentionally open to devices that can reach the store LAN.");
  }
  if (!fs.existsSync(config.environmentFile)) warnings.push(`Environment file was not found: ${config.environmentFile}`);

  return {
    ok: errors.length === 0,
    production,
    environmentFile: config.environmentFile,
    provider,
    errors,
    warnings,
  };
}

export function assertRuntimeConfig() {
  const report = runtimeConfigReport();
  if (report.production && !report.ok) {
    throw new Error(`Production configuration is invalid:\n- ${report.errors.join("\n- ")}`);
  }
  return report;
}

function validateCrm(errors, warnings) {
  if (!config.crm.databaseUrl) {
    errors.push("CRM_DATABASE_URL (or SUPABASE_DATABASE_URL) is required.");
    return;
  }
  let url;
  try {
    url = new URL(config.crm.databaseUrl);
  } catch {
    errors.push("CRM_DATABASE_URL must be a valid PostgreSQL URL.");
    return;
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) errors.push("CRM_DATABASE_URL must use PostgreSQL.");
  const urlPort = Number(url.port || 5432);
  if (process.env.CRM_POSTGRES_PORT && urlPort !== config.crm.postgresPort) {
    errors.push("CRM_POSTGRES_PORT must match the port inside CRM_DATABASE_URL.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(config.crm.encryptionKey || ""))) {
    errors.push("CRM_DATA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.");
  }
  if (!/^\d{4,12}$/.test(String(config.crm.staffPin || ""))) errors.push("CRM_STAFF_PIN must contain 4 to 12 digits.");
  if (!/^\d{4,12}$/.test(String(config.crm.superuserPin || ""))) errors.push("CRM_SUPERUSER_PIN must contain 4 to 12 digits.");
  if (config.crm.staffPin && config.crm.staffPin === config.crm.superuserPin) errors.push("Staff and superuser PINs must be different.");
  if (config.environment === "production" && config.crm.loginRateLimitDisabled) {
    errors.push("CRM login rate limiting cannot be disabled in production.");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    warnings.push("CRM PostgreSQL is not configured through loopback; verify network encryption and access controls.");
  }
}

function validateUrl(name, value, errors) {
  if (!value) return;
  try {
    new URL(value);
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}
