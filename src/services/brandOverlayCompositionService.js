// Adds the selected identity layers over a generated image without resizing or cropping it.

import sharp from "sharp";
import { normalizeBrandTone, requireAlasleeVariant, requireBrandDefinition } from "../domain/brandOverlayCatalog.js";
import { AppError } from "../utils/errors.js";
import {
  assetForegroundLuminance,
  getAlasleeOverlayAsset,
  getBrandOverlayAsset,
  getSystemOverlayAsset,
  relativeLuminance,
} from "./brandOverlayAssetService.js";
import { normalizeBrandOverlayLayout } from "./brandOverlaySettingsService.js";

export const defaultBrandOverlayCta = "Available now\nOrder it";

export async function composeBrandOverlay(source, options) {
  const metadata = await sharp(source, { failOn: "error" }).metadata();
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (!width || !height) throw new AppError("تعذر قراءة أبعاد الصورة المولدة.", 400);

  const brandId = requireBrandDefinition(options?.brandId).id;
  const alasleeVariant = requireAlasleeVariant(options?.alasleeVariant || "golden").id;
  const requestedBrandTone = normalizeBrandTone(options?.brandTone || options?.layout?.brandDefaultTone || "auto");
  const ctaText = normalizeBrandOverlayCta(options?.ctaText);
  const layout = normalizeBrandOverlayLayout(options?.layout);

  const originalBrand = await getBrandOverlayAsset(brandId, "original");
  const brandRect = destinationRect(layout.brandLogo, originalBrand, width, height);
  const brandTone = requestedBrandTone === "auto"
    ? await resolveBrandTone(source, brandRect, originalBrand)
    : requestedBrandTone;
  const supportingTone = layout.supportingTone === "auto"
    ? await resolveBinaryTone(source, supportSamplingRect(layout, width, height))
    : layout.supportingTone;

  const [brand, alaslee, cta, payments] = await Promise.all([
    getBrandOverlayAsset(brandId, brandTone),
    getAlasleeOverlayAsset(alasleeVariant),
    createCtaAsset(ctaText, supportingTone),
    createPaymentAsset(supportingTone),
  ]);

  const layers = await Promise.all([
    layerForAsset(brand, layout.brandLogo, width, height, "brandLogo"),
    layerForAsset(alaslee, layout.alasleeLogo, width, height, "alasleeLogo"),
    layerForAsset(cta, layout.cta, width, height, "cta"),
    layerForAsset(payments, layout.payments, width, height, "payments"),
  ]);

  const result = await sharp(source, { failOn: "error" })
    .composite(layers.map(({ name, width: layerWidth, height: layerHeight, ...layer }) => layer))
    .withMetadata()
    .png({ compressionLevel: options?.preview ? 4 : 9, adaptiveFiltering: !options?.preview })
    .toBuffer({ resolveWithObject: true });

  if (result.info.width !== width || result.info.height !== height) {
    throw new AppError("تعذر الحفاظ على أبعاد الصورة الأصلية أثناء إضافة الهوية.", 500);
  }

  return {
    buffer: result.data,
    width,
    height,
    brandTone,
    supportingTone,
    ctaText,
    layout,
    layers: Object.fromEntries(layers.map((layer) => [layer.name, {
      left: layer.left,
      top: layer.top,
      width: layer.width,
      height: layer.height,
    }])),
  };
}

export function normalizeBrandOverlayCta(value) {
  const text = String(value ?? defaultBrandOverlayCta)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
  if (!text) return defaultBrandOverlayCta;
  if (text.length > 80) throw new AppError("نص الدعوة للطلب يجب ألا يتجاوز 80 حرفاً.", 400);
  return text;
}

async function layerForAsset(asset, layout, canvasWidth, canvasHeight, name) {
  const rect = destinationRect(layout, asset, canvasWidth, canvasHeight);
  const resized = await sharp(asset.buffer)
    .resize({ width: rect.width, height: rect.height, fit: "fill" })
    .png()
    .toBuffer();
  return {
    input: resized,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    name,
  };
}

function destinationRect(layout, asset, canvasWidth, canvasHeight) {
  const targetWidth = Math.max(1, Math.min(canvasWidth, Math.round(canvasWidth * (layout.widthPercent / 100))));
  const naturalHeight = Math.max(1, Math.round(targetWidth * (asset.height / asset.width)));
  const targetHeight = Math.min(canvasHeight, naturalHeight);
  const adjustedWidth = naturalHeight > canvasHeight
    ? Math.max(1, Math.round(targetWidth * (canvasHeight / naturalHeight)))
    : targetWidth;
  const requestedLeft = Math.round(canvasWidth * (layout.xPercent / 100));
  const requestedTop = Math.round(canvasHeight * (layout.yPercent / 100));
  return {
    left: clamp(requestedLeft, 0, Math.max(0, canvasWidth - adjustedWidth)),
    top: clamp(requestedTop, 0, Math.max(0, canvasHeight - targetHeight)),
    width: adjustedWidth,
    height: targetHeight,
  };
}

async function resolveBrandTone(source, rect, originalBrand) {
  const background = await sampleLuminance(source, rect);
  const original = await assetForegroundLuminance(originalBrand);
  const candidates = [
    { tone: "original", luminance: original },
    { tone: "light", luminance: 1 },
    { tone: "dark", luminance: relativeLuminance(24, 22, 22) },
  ];
  return candidates
    .map((candidate) => ({ ...candidate, contrast: contrastRatio(background, candidate.luminance) }))
    .sort((a, b) => b.contrast - a.contrast)[0].tone;
}

async function resolveBinaryTone(source, rect) {
  const background = await sampleLuminance(source, rect);
  const lightContrast = contrastRatio(background, 1);
  const darkContrast = contrastRatio(background, relativeLuminance(24, 22, 22));
  return lightContrast >= darkContrast ? "light" : "dark";
}

async function sampleLuminance(source, rect) {
  const metadata = await sharp(source).metadata();
  const left = clamp(Math.round(rect.left), 0, Math.max(0, metadata.width - 1));
  const top = clamp(Math.round(rect.top), 0, Math.max(0, metadata.height - 1));
  const width = clamp(Math.round(rect.width), 1, metadata.width - left);
  const height = clamp(Math.round(rect.height), 1, metadata.height - top);
  const stats = await sharp(source)
    .extract({ left, top, width, height })
    .flatten({ background: "#ffffff" })
    .stats();
  return relativeLuminance(
    stats.channels[0]?.mean || 0,
    stats.channels[1]?.mean || 0,
    stats.channels[2]?.mean || 0,
  );
}

async function createCtaAsset(text, tone) {
  const color = tone === "light" ? "#ffffff" : "#181616";
  const lines = text.split("\n");
  const direction = /[\u0590-\u08ff]/.test(text) ? "rtl" : "ltr";
  const lineHeight = lines.length === 1 ? 250 : 205;
  const firstY = lines.length === 1 ? 315 : 205;
  const tspans = lines.map((line, index) => (
    `<tspan x="600" y="${firstY + (index * lineHeight)}">${escapeXml(line)}</tspan>`
  )).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
    <text x="600" text-anchor="middle" direction="${direction}" unicode-bidi="plaintext"
      font-family="Arial, Tahoma, sans-serif" font-size="${lines.length === 1 ? 190 : 155}"
      font-weight="700" fill="${color}">${tspans}</text>
  </svg>`;
  const result = await sharp(Buffer.from(svg)).png().trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    threshold: 1,
  }).toBuffer({ resolveWithObject: true });
  return { buffer: result.data, width: result.info.width, height: result.info.height };
}

async function createPaymentAsset(tone) {
  const [salla, tamara, madfu] = await Promise.all([
    getSystemOverlayAsset("salla.svg", tone),
    getSystemOverlayAsset("tamara.svg", tone),
    getSystemOverlayAsset("madfu.svg", tone),
  ]);
  const canvas = { width: 1000, height: 760 };
  const specs = [
    { asset: salla, left: 0, top: 85, width: 590, height: 590 },
    { asset: tamara, left: 630, top: 55, width: 350, height: 275 },
    { asset: madfu, left: 630, top: 415, width: 350, height: 275 },
  ];
  const composites = await Promise.all(specs.map(async (spec) => ({
    input: await sharp(spec.asset.buffer).resize({
      width: spec.width,
      height: spec.height,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer(),
    left: spec.left,
    top: spec.top,
  })));
  const result = await sharp({
    create: { ...canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    threshold: 1,
  }).toBuffer({ resolveWithObject: true });
  return { buffer: result.data, width: result.info.width, height: result.info.height };
}

function supportSamplingRect(layout, width, height) {
  const elements = [layout.alasleeLogo, layout.cta, layout.payments];
  const left = Math.min(...elements.map((item) => item.xPercent)) / 100 * width;
  const top = Math.min(...elements.map((item) => item.yPercent)) / 100 * height;
  const right = Math.max(...elements.map((item) => item.xPercent + item.widthPercent)) / 100 * width;
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, right - left)),
    height: Math.max(1, height - top),
  };
}

function contrastRatio(a, b) {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
