// Creates a no-AI Instagram composition preview from an operator-supplied square image.

import { config } from "../config.js";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { INPUT_MODES, PRODUCT_STATUSES } from "../domain/statuses.js";
import { validateUploadedImage } from "../utils/imageValidation.js";
import { fileSize, writeFileEnsured } from "../utils/files.js";
import { requireBrandingAssetPaths } from "./brandingAssetService.js";
import {
  getCompositionFormat,
  normalizeCompositionSettings,
} from "./compositionSettingsService.js";
import { composeInstagramImage } from "./instagramCompositionService.js";
import { insertInstagramImage } from "./instagramImageRepository.js";
import { getProductById, getProductRecord } from "./productService.js";
import { instagramDirForProduct } from "./productStorage.js";
import { insertProductWithOriginals } from "./productWriter.js";

export async function createBrandingPreview(file, inputSettings) {
  const { normalizedSample, settings, format } = await previewInputs(file, inputSettings);
  return composePreview(normalizedSample, settings, format);
}

export async function saveBrandingPreviewOutput(productId, file, inputSettings, req = undefined) {
  const product = productId ? getProductRecord(productId) : createPreviewProduct();
  const { normalizedSample, settings, format } = await previewInputs(file, inputSettings);
  const preview = await composePreview(normalizedSample, settings, format);
  const saved = await savePreviewFile(product, format, preview);
  await insertPreviewRecord(product.id, format, saved);
  return getProductById(product.id, req);
}

function createPreviewProduct() {
  const id = crypto.randomUUID();
  insertProductWithOriginals({
    product: {
      id,
      status: PRODUCT_STATUSES.PREVIEW,
      provider: "local-preview",
      inputMode: INPUT_MODES.DEBUG_PREVIEW,
      brandingEnabled: false,
      now: new Date().toISOString(),
      actor: "system",
    },
    originals: [],
  });
  console.info(`[preview] created local preview product ${id}`);
  return getProductRecord(id);
}

async function previewInputs(file, inputSettings) {
  const sample = await validateUploadedImage(file, "sample", config.maxImageBytes);
  const normalizedSample = await normalizeSampleToSquare(sample.buffer);
  const settings = normalizeCompositionSettings(inputSettings);
  const format = getCompositionFormat(inputSettings?.format);
  return { normalizedSample, settings, format };
}

async function composePreview(normalizedSample, settings, format) {
  const assets = await requireBrandingAssetPaths();
  return composeInstagramImage(normalizedSample, assets, settings, {
    width: format.width,
    height: format.height,
  }, {
    compressionLevel: 2,
    adaptiveFiltering: false,
  });
}

async function savePreviewFile(product, format, preview) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `instagram-preview-${format.id}-${timestamp}.png`;
  const outputPath = path.join(instagramDirForProduct(product), filename);
  await writeFileEnsured(outputPath, preview.buffer);
  return { ...preview, filename, path: outputPath };
}

async function insertPreviewRecord(productId, format, saved) {
  const role = `instagram-preview-${format.id}-${Date.now()}`;
  insertInstagramImage(productId, {
    role,
    filename: saved.filename,
    path: saved.path,
    mimeType: "image/png",
    sizeBytes: await fileSize(saved.path),
    width: saved.width,
    height: saved.height,
    sourceGeneratedImageId: null,
    sourceRole: "debug-preview",
    profileId: format.id,
    productSku: null,
    productPrice: null,
    localPath: saved.path,
    priceLabelReferencePath: null,
    priceLabelProvider: null,
    priceLabelModel: null,
    priceLabelPrompt: null,
    status: "preview",
    errorMessage: null,
    completedAt: new Date().toISOString(),
  });
}

export async function normalizeSampleToSquare(buffer) {
  return sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(1080, 1080, {
      fit: "contain",
      position: "center",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}
