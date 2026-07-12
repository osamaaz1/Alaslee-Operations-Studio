// Manages uploaded branding assets and reports whether the server can read them.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, storagePaths } from "../config.js";
import { validateUploadedImage } from "../utils/imageValidation.js";
import { writeFileEnsured } from "../utils/files.js";
import { AppError } from "../utils/errors.js";
import { toUploadUrl, absoluteUrl } from "../utils/urls.js";
import { getPriceLabelEditorStatus } from "./priceLabelEditService.js";

const definitions = Object.freeze({
  background: { envPath: () => config.branding.backgroundPath, filename: "background.png" },
  logo: { envPath: () => config.branding.logoPath, filename: "logo.png" },
  footer: { envPath: () => config.branding.footerPath, filename: "footer.png" },
  priceLabelReference: {
    envPath: () => config.branding.priceLabelReferencePath,
    filename: "price-label-reference.png",
  },
});

const requiredCompositionAssets = Object.freeze(["background", "logo", "footer"]);
const supportedImageFormats = new Set(["jpeg", "png", "webp"]);

export async function saveBrandingAssets(files, req = undefined) {
  const supplied = Object.entries(definitions).filter(([name]) => files?.[name]?.[0]);
  if (supplied.length === 0) {
    throw new AppError(
      "Upload at least one branding asset: background, logo, footer, or price label reference.",
      400,
    );
  }

  for (const [name, definition] of supplied) {
    const file = files[name][0];
    const validated = await validateUploadedImage(file, name, config.maxImageBytes);
    const normalized = await sharp(validated.buffer, { failOn: "error" })
      .rotate()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    await writeFileEnsured(path.join(storagePaths.brandingDir, definition.filename), normalized);
  }

  return getBrandingAssetStatus(req);
}

export async function getBrandingAssetStatus(req = undefined) {
  const assets = {};

  for (const [name, definition] of Object.entries(definitions)) {
    assets[name] = await inspectAsset(name, definition, req);
  }

  const priceLabelEditor = getPriceLabelEditorStatus();
  const priceLabelReferenceReady = assets.priceLabelReference?.accessible === true;
  return {
    ready: requiredCompositionAssets.every((name) => assets[name]?.accessible),
    priceLabelReady: priceLabelReferenceReady && priceLabelEditor.configured,
    priceLabelReferenceReady,
    priceLabelEditor,
    required: requiredCompositionAssets,
    requiredForPriceLabel: ["priceLabelReference"],
    assets,
  };
}

export async function requireBrandingAssetPaths() {
  const paths = {};
  const missing = [];

  for (const name of requiredCompositionAssets) {
    const definition = definitions[name];
    const resolved = await resolveAsset(definition);
    if (!resolved) {
      missing.push(name);
      continue;
    }
    paths[name] = resolved.path;
  }

  if (missing.length > 0) {
    throw new AppError(
      `Instagram branding requires accessible assets: ${missing.join(", ")}. Upload them in Brand Kit.`,
      400,
    );
  }

  return paths;
}

export async function requirePriceLabelReferencePath() {
  const resolved = await resolveAsset(definitions.priceLabelReference);
  if (!resolved) {
    throw new AppError("Instagram price insertion requires an accessible price-label reference image.", 400);
  }
  await assertReadableImage(resolved.path, "price-label reference");

  return resolved.path;
}

async function inspectAsset(name, definition, req) {
  const resolved = await resolveAsset(definition);
  if (!resolved) {
    return {
      name,
      configured: Boolean(definition.envPath()),
      accessible: false,
      source: definition.envPath() ? "environment" : "missing",
      filename: null,
      url: null,
      width: null,
      height: null,
    };
  }

  let metadata;
  try {
    metadata = await sharp(resolved.path, { failOn: "error" }).metadata();
  } catch {
    return {
      name,
      configured: true,
      accessible: false,
      source: resolved.source,
      filename: path.basename(resolved.path),
      url: null,
      width: null,
      height: null,
    };
  }

  const relativeUrl = resolved.source === "uploaded" ? toUploadUrl(resolved.path) : null;
  return {
    name,
    configured: true,
    accessible: true,
    source: resolved.source,
    filename: path.basename(resolved.path),
    url: relativeUrl && req ? absoluteUrl(req, relativeUrl) : relativeUrl,
    width: metadata.width || null,
    height: metadata.height || null,
  };
}

async function resolveAsset(definition) {
  const uploadedPath = path.join(storagePaths.brandingDir, definition.filename);
  if (await isReadableFile(uploadedPath)) {
    return { path: uploadedPath, source: "uploaded" };
  }

  const envPath = definition.envPath();
  if (envPath && (await isReadableFile(envPath))) {
    return { path: envPath, source: "environment" };
  }

  return null;
}

async function isReadableFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    await fs.access(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function assertReadableImage(filePath, label) {
  let metadata;
  try {
    metadata = await sharp(filePath, { failOn: "error" }).metadata();
  } catch {
    throw new AppError(`The ${label} must be a readable JPG, PNG, or WEBP image.`, 400);
  }
  if (!metadata.width || !metadata.height) {
    throw new AppError(`The ${label} image dimensions could not be read.`, 400);
  }
  if (!supportedImageFormats.has(metadata.format)) {
    throw new AppError(`The ${label} must be a JPG, PNG, or WEBP image.`, 400);
  }
}
