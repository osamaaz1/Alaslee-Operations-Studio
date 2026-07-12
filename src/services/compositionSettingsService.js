// Persists independent, validated composition profiles for each social output format.

import fs from "node:fs/promises";
import path from "node:path";
import { storagePaths } from "../config.js";
import { writeFileEnsured } from "../utils/files.js";
import { AppError } from "../utils/errors.js";

const settingsPath = path.join(storagePaths.brandingDir, "composition-settings.json");
const defaultFormatId = "portrait-4x5";

export const compositionFormats = Object.freeze({
  "portrait-4x5": Object.freeze({
    id: "portrait-4x5",
    ratio: "4:5",
    label: "Feed portrait",
    width: 1080,
    height: 1350,
  }),
  "square-1x1": Object.freeze({
    id: "square-1x1",
    ratio: "1:1",
    label: "Square post",
    width: 1080,
    height: 1080,
  }),
  "story-9x16": Object.freeze({
    id: "story-9x16",
    ratio: "9:16",
    label: "Story / Reel",
    width: 1080,
    height: 1920,
  }),
  "landscape-1.91x1": Object.freeze({
    id: "landscape-1.91x1",
    ratio: "1.91:1",
    label: "Feed landscape",
    width: 1080,
    height: 566,
  }),
});

export const compositionDefaults = Object.freeze({
  backgroundZoomPercent: 100,
  backgroundOffsetXPercent: 0,
  backgroundOffsetYPercent: 0,
  productWidthPercent: 94,
  productOffsetYPercent: 0,
  shadowEnabled: true,
  shadowBlurPercent: 3,
  shadowOpacityPercent: 14,
  shadowOffsetXPercent: 0,
  shadowOffsetYPercent: 2,
  logoWidthPercent: 16,
  logoOpacityPercent: 100,
  logoMarginPercent: 5,
  logoOffsetXPercent: 0,
  logoOffsetYPercent: 0,
  footerWidthPercent: 100,
  footerMaxHeightPercent: 20,
  footerOpacityPercent: 100,
  footerOffsetXPercent: 0,
  footerBottomMarginPercent: 3,
  logoCorner: "top-right",
});

export const compositionRanges = Object.freeze({
  backgroundZoomPercent: { min: 100, max: 180 },
  backgroundOffsetXPercent: { min: -30, max: 30 },
  backgroundOffsetYPercent: { min: -30, max: 30 },
  productWidthPercent: { min: 50, max: 110 },
  productOffsetYPercent: { min: -25, max: 25 },
  shadowBlurPercent: { min: 0, max: 8 },
  shadowOpacityPercent: { min: 0, max: 70 },
  shadowOffsetXPercent: { min: -10, max: 10 },
  shadowOffsetYPercent: { min: -10, max: 15 },
  logoWidthPercent: { min: 5, max: 35 },
  logoOpacityPercent: { min: 10, max: 100 },
  logoMarginPercent: { min: 0, max: 15 },
  logoOffsetXPercent: { min: -30, max: 30 },
  logoOffsetYPercent: { min: -30, max: 30 },
  footerWidthPercent: { min: 30, max: 100 },
  footerMaxHeightPercent: { min: 5, max: 60 },
  footerOpacityPercent: { min: 10, max: 100 },
  footerOffsetXPercent: { min: -30, max: 30 },
  footerBottomMarginPercent: { min: 0, max: 30 },
});

const allowedCorners = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);

export async function getCompositionSettingsDocument() {
  const saved = await readStoredDocument();
  const activeFormat = validFormatId(saved?.activeFormat) ? saved.activeFormat : defaultFormatId;
  const profiles = buildProfiles(saved?.profiles);

  return {
    source: saved ? "saved" : "built-in",
    activeFormat,
    format: compositionFormats[activeFormat],
    output: formatDimensions(activeFormat),
    settings: profiles[activeFormat],
    profiles,
    formats: Object.values(compositionFormats),
    defaults: { ...compositionDefaults },
    ranges: compositionRanges,
  };
}

export async function loadCompositionSettings() {
  return (await getCompositionSettingsDocument()).settings;
}

export async function loadActiveCompositionProfile() {
  const document = await getCompositionSettingsDocument();
  return {
    format: document.activeFormat,
    output: document.output,
    settings: document.settings,
  };
}

export function getCompositionFormat(formatId) {
  const format = compositionFormats[String(formatId || defaultFormatId)];
  if (!format) {
    throw new AppError(`Unsupported composition format "${formatId}".`, 400);
  }
  return format;
}

export function normalizeCompositionSettings(input = {}) {
  const normalized = {};

  for (const [name, range] of Object.entries(compositionRanges)) {
    const fallback = compositionDefaults[name];
    const value = input[name] === undefined ? fallback : Number(input[name]);
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      throw new AppError(`${name} must be between ${range.min} and ${range.max}.`, 400);
    }
    normalized[name] = Math.round(value);
  }

  normalized.shadowEnabled = booleanValue(input.shadowEnabled, compositionDefaults.shadowEnabled);

  const corner = String(input.logoCorner || compositionDefaults.logoCorner);
  if (!allowedCorners.has(corner)) {
    throw new AppError("logoCorner must be top-left, top-right, bottom-left, or bottom-right.", 400);
  }
  normalized.logoCorner = corner;

  return normalized;
}

export async function saveCompositionSettings(input) {
  const format = getCompositionFormat(input?.format);
  const existing = await readStoredDocument();
  const profiles = buildProfiles(existing?.profiles);
  profiles[format.id] = normalizeCompositionSettings(input);

  const stored = {
    version: 2,
    activeFormat: format.id,
    profiles,
  };
  await writeFileEnsured(settingsPath, Buffer.from(`${JSON.stringify(stored, null, 2)}\n`));
  return getCompositionSettingsDocument();
}

function buildProfiles(savedProfiles = {}) {
  return Object.fromEntries(
    Object.keys(compositionFormats).map((formatId) => [
      formatId,
      normalizeCompositionSettings(savedProfiles?.[formatId] || compositionDefaults),
    ]),
  );
}

async function readStoredDocument() {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    if (parsed?.profiles && typeof parsed.profiles === "object") {
      return parsed;
    }

    // Migrates the original single-profile settings file into the 4:5 profile.
    return {
      version: 1,
      activeFormat: defaultFormatId,
      profiles: { [defaultFormatId]: parsed },
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new AppError("Saved composition settings are not valid JSON.", 500);
    }
    throw error;
  }
}

function formatDimensions(formatId) {
  const format = getCompositionFormat(formatId);
  return { width: format.width, height: format.height };
}

function validFormatId(value) {
  return Boolean(compositionFormats[value]);
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}
