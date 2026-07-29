// Normalizes the supplied logo library into transparent, reusable PNG overlays.

import sharp from "sharp";
import {
  alasleeAssetPath,
  brandAssetPath,
  normalizeBrandTone,
  systemOverlayAssetPath,
} from "../domain/brandOverlayCatalog.js";
import { AppError } from "../utils/errors.js";

const sourceCache = new Map();
const toneCache = new Map();
const rasterBounds = Object.freeze({ width: 1600, height: 800 });
const toneColors = Object.freeze({
  light: { r: 255, g: 255, b: 255 },
  dark: { r: 24, g: 22, b: 22 },
});

export function getBrandOverlayAsset(brandId, tone = "original") {
  return preparedToneAsset(brandAssetPath(brandId), normalizeRenderableTone(tone));
}

export function getAlasleeOverlayAsset(variantId) {
  return preparedToneAsset(alasleeAssetPath(variantId), "original");
}

export function getSystemOverlayAsset(filename, tone = "original") {
  const assetPath = systemOverlayAssetPath(filename);
  const normalizedTone = normalizeRenderableTone(tone);
  return filename === "salla.svg"
    ? preparedCroppedToneAsset(assetPath, normalizedTone, "top-half")
    : preparedToneAsset(assetPath, normalizedTone);
}

export async function assetForegroundLuminance(asset) {
  const raw = await sharp(asset.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let total = 0;
  let weight = 0;
  for (let index = 0; index < raw.data.length; index += raw.info.channels) {
    const alpha = raw.data[index + 3] / 255;
    if (alpha <= 0.02) continue;
    total += relativeLuminance(raw.data[index], raw.data[index + 1], raw.data[index + 2]) * alpha;
    weight += alpha;
  }
  return weight ? total / weight : 0;
}

export function relativeLuminance(r, g, b) {
  const channels = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

async function preparedToneAsset(assetPath, tone) {
  const key = `${assetPath}::${tone}`;
  if (!toneCache.has(key)) {
    toneCache.set(key, (async () => {
      const original = await preparedSourceAsset(assetPath);
      if (tone === "original") return original;
      const buffer = await recolorAlpha(original.buffer, toneColors[tone]);
      return { ...original, buffer, tone };
    })().catch((error) => {
      toneCache.delete(key);
      throw error;
    }));
  }
  return toneCache.get(key);
}

async function preparedCroppedToneAsset(assetPath, tone, cropId) {
  const key = `${assetPath}::${cropId}::${tone}`;
  if (!toneCache.has(key)) {
    toneCache.set(key, (async () => {
      const source = await preparedSourceAsset(assetPath);
      const height = Math.max(1, Math.floor(source.height / 2));
      const cropped = await sharp(source.buffer)
        .extract({ left: 0, top: 0, width: source.width, height })
        .png()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
        .toBuffer({ resolveWithObject: true });
      const original = {
        buffer: cropped.data,
        width: cropped.info.width,
        height: cropped.info.height,
        tone: "original",
      };
      if (tone === "original") return original;
      return {
        ...original,
        buffer: await recolorAlpha(original.buffer, toneColors[tone]),
        tone,
      };
    })().catch((error) => {
      toneCache.delete(key);
      throw error;
    }));
  }
  return toneCache.get(key);
}

async function preparedSourceAsset(assetPath) {
  if (!sourceCache.has(assetPath)) {
    sourceCache.set(assetPath, normalizeTransparentAsset(assetPath).catch((error) => {
      sourceCache.delete(assetPath);
      throw error;
    }));
  }
  return sourceCache.get(assetPath);
}

async function normalizeTransparentAsset(assetPath) {
  let raw;
  try {
    raw = await sharp(assetPath, { density: 240, failOn: "error", limitInputPixels: false })
      .resize({
        width: rasterBounds.width,
        height: rasterBounds.height,
        fit: "inside",
        withoutEnlargement: false,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new AppError(`تعذر تجهيز أحد ملفات الشعارات: ${error.message}`, 500);
  }

  const data = Buffer.from(raw.data);
  removeUniformOpaqueBackground(data, raw.info);
  clearInvisibleRgb(data, raw.info.channels);

  const alphaPixels = countVisiblePixels(data, raw.info.channels);
  if (!alphaPixels) throw new AppError("أحد ملفات الشعارات لا يحتوي على تفاصيل مرئية.", 500);

  const result = await sharp(data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    tone: "original",
  };
}

function removeUniformOpaqueBackground(data, info) {
  const { width, height, channels } = info;
  if (channels < 4 || width < 2 || height < 2) return;
  const points = [
    pixelAt(data, channels, 0),
    pixelAt(data, channels, width - 1),
    pixelAt(data, channels, (height - 1) * width),
    pixelAt(data, channels, (height * width) - 1),
  ];
  let background = null;
  if (points.every((point) => point.a >= 245)) {
    const cornerColor = {
      r: Math.round(points.reduce((sum, point) => sum + point.r, 0) / points.length),
      g: Math.round(points.reduce((sum, point) => sum + point.g, 0) / points.length),
      b: Math.round(points.reduce((sum, point) => sum + point.b, 0) / points.length),
    };
    // Exported brand SVGs sometimes draw a one-pixel border in a slightly
    // different shade than their otherwise uniform background.
    if (points.every((point) => colorDistance(point, cornerColor) <= 96)) {
      background = cornerColor;
    }
  }

  // Some SVGs place an opaque logo tile inside a larger transparent viewBox.
  // Detect a dense, dominant color in that visible rectangle so the tile does
  // not turn into a solid block when a light/dark tone is requested.
  background ||= denseBackdropColor(data, info);
  if (!background) return;

  for (let index = 0; index < data.length; index += channels) {
    const distance = colorDistance(
      { r: data[index], g: data[index + 1], b: data[index + 2] },
      background,
    );
    const coverage = Math.max(0, Math.min(1, (distance - 45) / 70));
    data[index + 3] = Math.round(data[index + 3] * coverage);
  }
}

function denseBackdropColor(data, info) {
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  const buckets = new Map();

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * channels;
    const alpha = data[index + 3];
    if (alpha <= 8) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (alpha < 245) continue;
    opaque += 1;
    const key = `${data[index] >> 4}:${data[index + 1] >> 4}:${data[index + 2] >> 4}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += data[index];
    bucket.g += data[index + 1];
    bucket.b += data[index + 2];
    buckets.set(key, bucket);
  }

  if (maxX < minX || maxY < minY) return null;
  const boundsArea = (maxX - minX + 1) * (maxY - minY + 1);
  if (!boundsArea || opaque / boundsArea < 0.62) return null;
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count / opaque < 0.35) return null;
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count),
  };
}

async function recolorAlpha(buffer, color) {
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < raw.data.length; index += raw.info.channels) {
    raw.data[index] = color.r;
    raw.data[index + 1] = color.g;
    raw.data[index + 2] = color.b;
  }
  return sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels },
  }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

function pixelAt(data, channels, pixelIndex) {
  const index = pixelIndex * channels;
  return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}

function colorDistance(a, b) {
  return Math.sqrt(((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2));
}

function clearInvisibleRgb(data, channels) {
  for (let index = 0; index < data.length; index += channels) {
    if (data[index + 3] !== 0) continue;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
  }
}

function countVisiblePixels(data, channels) {
  let count = 0;
  for (let index = 3; index < data.length; index += channels) {
    if (data[index] > 8) count += 1;
  }
  return count;
}

function normalizeRenderableTone(value) {
  const tone = String(value || "original").toLowerCase();
  if (!["original", "light", "dark"].includes(tone)) {
    throw new AppError("المعاينة المباشرة للشعار تدعم الأصلي أو الفاتح أو الداكن.", 400);
  }
  return tone;
}
