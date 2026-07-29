// Persists the native-size brand-overlay layout and optional per-brand logo overrides.

import fs from "node:fs/promises";
import path from "node:path";
import { storagePaths } from "../config.js";
import { requireBrandDefinition, normalizeBrandTone } from "../domain/brandOverlayCatalog.js";
import { AppError } from "../utils/errors.js";
import { writeFileEnsured } from "../utils/files.js";

const settingsPath = path.join(storagePaths.brandingDir, "brand-overlay-settings.json");
const elementNames = Object.freeze(["brandLogo", "alasleeLogo", "cta", "payments"]);
const supportingTones = new Set(["auto", "light", "dark"]);

export const brandOverlayDefaultLayout = Object.freeze({
  brandLogo: Object.freeze({ xPercent: 33.52, yPercent: 70.81, widthPercent: 33.15 }),
  alasleeLogo: Object.freeze({ xPercent: 41.67, yPercent: 92.07, widthPercent: 16.76 }),
  cta: Object.freeze({ xPercent: 7.22, yPercent: 92.07, widthPercent: 12.69 }),
  payments: Object.freeze({ xPercent: 84.54, yPercent: 92.15, widthPercent: 8.24 }),
  supportingTone: "auto",
});

export const brandOverlayLayoutRanges = Object.freeze({
  xPercent: { min: 0, max: 100 },
  yPercent: { min: 0, max: 100 },
  widthPercent: { min: 2, max: 80 },
});

export async function getBrandOverlaySettingsDocument(brandId = undefined) {
  const stored = await readStoredDocument();
  const globalLayout = normalizeBrandOverlayLayout(stored?.globalLayout || brandOverlayDefaultLayout);
  const brandOverrides = normalizeOverrides(stored?.brandOverrides || {});
  const requestedBrand = brandId ? requireBrandDefinition(brandId).id : undefined;
  return {
    version: 1,
    source: stored ? "saved" : "approved-reference",
    globalLayout,
    brandOverrides,
    effectiveLayout: requestedBrand
      ? effectiveBrandOverlayLayout({ globalLayout, brandOverrides }, requestedBrand)
      : globalLayout,
    ranges: brandOverlayLayoutRanges,
  };
}

export async function loadEffectiveBrandOverlayLayout(brandId) {
  const document = await getBrandOverlaySettingsDocument();
  return effectiveBrandOverlayLayout(document, requireBrandDefinition(brandId).id);
}

export function normalizeBrandOverlayLayout(input = {}, fallback = brandOverlayDefaultLayout) {
  const normalized = {};
  for (const name of elementNames) {
    normalized[name] = normalizeElement(input?.[name], fallback[name], name);
  }
  const supportingTone = String(input?.supportingTone || fallback.supportingTone || "auto").toLowerCase();
  if (!supportingTones.has(supportingTone)) {
    throw new AppError("لون النص وشعارات الدفع يجب أن يكون تلقائياً أو فاتحاً أو داكناً.", 400);
  }
  normalized.supportingTone = supportingTone;
  return normalized;
}

export function effectiveBrandOverlayLayout(document, brandId) {
  const globalLayout = normalizeBrandOverlayLayout(document?.globalLayout || brandOverlayDefaultLayout);
  const override = document?.brandOverrides?.[brandId];
  return {
    ...globalLayout,
    brandLogo: override?.brandLogo
      ? normalizeElement(override.brandLogo, globalLayout.brandLogo, "brandLogo")
      : globalLayout.brandLogo,
    brandDefaultTone: override?.defaultTone
      ? normalizeBrandTone(override.defaultTone)
      : "auto",
  };
}

export async function saveBrandOverlaySettings(input = {}) {
  const current = await getBrandOverlaySettingsDocument();
  const scope = String(input.scope || "");

  if (scope === "global") {
    const globalLayout = normalizeBrandOverlayLayout(input.layout, current.globalLayout);
    await persist({ globalLayout, brandOverrides: current.brandOverrides });
    return getBrandOverlaySettingsDocument(input.brandId);
  }

  if (scope === "brand") {
    const brandId = requireBrandDefinition(input.brandId).id;
    const currentOverride = current.brandOverrides[brandId] || {};
    const brandLogo = normalizeElement(
      input.brandLogo || input.layout?.brandLogo,
      currentOverride.brandLogo || current.globalLayout.brandLogo,
      "brandLogo",
    );
    const defaultTone = normalizeBrandTone(input.defaultTone || currentOverride.defaultTone || "auto");
    const brandOverrides = {
      ...current.brandOverrides,
      [brandId]: { brandLogo, defaultTone },
    };
    await persist({ globalLayout: current.globalLayout, brandOverrides });
    return getBrandOverlaySettingsDocument(brandId);
  }

  if (scope === "reset-brand") {
    const brandId = requireBrandDefinition(input.brandId).id;
    const brandOverrides = { ...current.brandOverrides };
    delete brandOverrides[brandId];
    await persist({ globalLayout: current.globalLayout, brandOverrides });
    return getBrandOverlaySettingsDocument(brandId);
  }

  if (scope === "reset-global") {
    await persist({ globalLayout: brandOverlayDefaultLayout, brandOverrides: current.brandOverrides });
    return getBrandOverlaySettingsDocument(input.brandId);
  }

  throw new AppError("حدد ما إذا كان الحفظ عاماً أو خاصاً بالماركة.", 400);
}

function normalizeElement(input, fallback, name) {
  const source = input && typeof input === "object" ? input : fallback;
  if (!source) throw new AppError(`إعداد موضع ${name} غير مكتمل.`, 400);
  return Object.fromEntries(Object.entries(brandOverlayLayoutRanges).map(([field, range]) => {
    const value = Number(source[field] ?? fallback?.[field]);
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      throw new AppError(`${name}.${field} يجب أن يكون بين ${range.min} و${range.max}.`, 400);
    }
    return [field, Math.round(value * 100) / 100];
  }));
}

function normalizeOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result = {};
  for (const [rawBrandId, override] of Object.entries(input)) {
    let brandId;
    try {
      brandId = requireBrandDefinition(rawBrandId).id;
    } catch {
      continue;
    }
    result[brandId] = {
      brandLogo: normalizeElement(override?.brandLogo, brandOverlayDefaultLayout.brandLogo, "brandLogo"),
      defaultTone: normalizeBrandTone(override?.defaultTone || "auto"),
    };
  }
  return result;
}

async function persist(document) {
  const payload = {
    version: 1,
    globalLayout: normalizeBrandOverlayLayout(document.globalLayout),
    brandOverrides: normalizeOverrides(document.brandOverrides),
    updatedAt: new Date().toISOString(),
  };
  await writeFileEnsured(settingsPath, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`));
}

async function readStoredDocument() {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new AppError("إعدادات محرر الهوية المحفوظة غير صالحة.", 500);
    throw error;
  }
}
