// Loads environment configuration and centralizes runtime limits.

import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const rootDir = process.cwd();
const defaultRateLimitWindowMs = 60_000;
const defaultRateLimitMax = 120;

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromEnv(name, fallback = false) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function valueFromEnvSet(name, fallback, allowed) {
  const value = String(process.env[name] || fallback).trim().toLowerCase();
  return allowed.has(value) ? value : fallback;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function resolveOptionalPath(value) {
  if (!value) return undefined;
  return resolveFromRoot(value);
}

function pathsFromEnv(name, fallback) {
  const raw = process.env[name];
  const values = raw ? raw.split(path.delimiter) : fallback;
  return values.map((value) => resolveFromRoot(value.trim()));
}

function commaSeparatedValues(name) {
  return String(process.env[name] || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function normalizedUrl(value) {
  return value ? String(value).trim().replace(/\/+$/, "") : undefined;
}

export const config = {
  rootDir,
  port: intFromEnv("PORT", 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  localDevClientOrigin: process.env.LOCAL_DEV_CLIENT_ORIGIN,
  aiProvider: (process.env.AI_PROVIDER || "gemini").trim().toLowerCase(),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-image",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    priceLabelModel: process.env.OPENAI_PRICE_LABEL_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    requestTimeoutMs: intFromEnv("OPENAI_REQUEST_TIMEOUT_MS", 180_000),
    imageRequestSize: process.env.OPENAI_IMAGE_REQUEST_SIZE || "auto",
    imageQuality: valueFromEnvSet("OPENAI_IMAGE_QUALITY", "medium", new Set(["low", "medium", "high", "auto"])),
  },
  databasePath: resolveFromRoot(process.env.DATABASE_PATH || "./data/products.sqlite"),
  dataWorkspaceDir: resolveFromRoot(process.env.ORIGINALEYE_DATA_ROOT || "./OriginalEye-Data-Analysis"),
  uploadsDir: resolveFromRoot(process.env.UPLOADS_DIR || "./uploads"),
  allowedImportRoots: pathsFromEnv("ALLOWED_IMPORT_ROOTS", [rootDir]),
  maxImageBytes: intFromEnv("MAX_IMAGE_MB", 20) * 1024 * 1024,
  outputImageSize: intFromEnv("OUTPUT_IMAGE_SIZE", 2048),
  security: {
    adminApiKey: process.env.ADMIN_API_KEY,
    rateLimitWindowMs: intFromEnv("RATE_LIMIT_WINDOW_MS", defaultRateLimitWindowMs),
    rateLimitMax: intFromEnv("RATE_LIMIT_MAX", defaultRateLimitMax),
  },
  crm: {
    databaseUrl: process.env.CRM_DATABASE_URL || process.env.SUPABASE_DATABASE_URL,
    encryptionKey: process.env.CRM_DATA_ENCRYPTION_KEY,
    encryptionPreviousKeys: commaSeparatedValues("CRM_DATA_ENCRYPTION_PREVIOUS_KEYS"),
    staffPin: process.env.CRM_STAFF_PIN,
    superuserPin: process.env.CRM_SUPERUSER_PIN,
    sessionHours: intFromEnv("CRM_SESSION_HOURS", 8),
    priceFloorPercent: intFromEnv("CRM_PRICE_FLOOR_PERCENT", 50),
    secureCookie: boolFromEnv("CRM_SECURE_COOKIE", process.env.NODE_ENV === "production"),
  },
  supabase: {
    url: normalizedUrl(process.env.SUPABASE_URL),
    serverKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    feedbackBucket: process.env.SUPABASE_FEEDBACK_BUCKET || "feedback-attachments",
    feedbackMaxImageBytes: intFromEnv("SUPABASE_FEEDBACK_MAX_IMAGE_MB", 6) * 1024 * 1024,
    feedbackRateLimitWindowMs: intFromEnv("SUPABASE_FEEDBACK_RATE_LIMIT_WINDOW_MS", 15 * 60_000),
    feedbackRateLimitMax: intFromEnv("SUPABASE_FEEDBACK_RATE_LIMIT_MAX", 10),
  },
  daftra: {
    subdomain: process.env.DAFTRA_SUBDOMAIN,
    apiKey: process.env.DAFTRA_API_KEY,
    accessToken: process.env.DAFTRA_ACCESS_TOKEN,
    syncMinutes: intFromEnv("DAFTRA_SYNC_MINUTES", 60),
    pageLimit: intFromEnv("DAFTRA_PAGE_LIMIT", 100),
  },
  branding: {
    backgroundPath: resolveOptionalPath(process.env.BRAND_BACKGROUND_PATH),
    logoPath: resolveOptionalPath(process.env.BRAND_LOGO_PATH),
    footerPath: resolveOptionalPath(process.env.BRAND_FOOTER_PATH),
    priceLabelReferencePath: resolveOptionalPath(process.env.BRAND_PRICE_LABEL_REFERENCE_PATH),
    logoCorner: process.env.BRAND_LOGO_CORNER || "top-right",
  },
  salla: {
    clientId: process.env.CRM_SALLA_CLIENT_ID || process.env.SALLA_CLIENT_ID,
    redirectUri: process.env.CRM_SALLA_REDIRECT_URI || process.env.SALLA_REDIRECT_URI,
    apiBaseUrl: process.env.CRM_SALLA_API_BASE_URL || process.env.SALLA_API_BASE_URL || "https://api.salla.dev/admin/v2",
    authUrl: process.env.CRM_SALLA_AUTH_URL || process.env.SALLA_AUTH_URL || "https://accounts.salla.sa/oauth2/auth",
    tokenUrl: process.env.CRM_SALLA_TOKEN_URL || process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token",
    webhookSecret: process.env.CRM_SALLA_WEBHOOK_SECRET || process.env.SALLA_WEBHOOK_SECRET,
    webhookToken: process.env.CRM_SALLA_WEBHOOK_TOKEN || process.env.SALLA_WEBHOOK_TOKEN,
    accessToken: process.env.CRM_SALLA_ACCESS_TOKEN || process.env.SALLA_ACCESS_TOKEN,
  },
};

export const storagePaths = {
  originalsDir: path.join(config.uploadsDir, "originals"),
  generatedDir: path.join(config.uploadsDir, "generated"),
  productsDir: path.join(config.uploadsDir, "products"),
  brandingDir: path.join(config.uploadsDir, "branding"),
};
