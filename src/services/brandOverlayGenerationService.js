// Previews and stores optional identity overlays for one or many generated images.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db/database.js";
import {
  normalizeBrandTone,
  requireAlasleeVariant,
  requireBrandDefinition,
} from "../domain/brandOverlayCatalog.js";
import { AppError, isAppError } from "../utils/errors.js";
import { fileSize, writeFileEnsured } from "../utils/files.js";
import { absoluteUrl, toUploadUrl } from "../utils/urls.js";
import { composeBrandOverlay, normalizeBrandOverlayCta } from "./brandOverlayCompositionService.js";
import { insertInstagramImage } from "./instagramImageRepository.js";
import { getProductRecord } from "./productService.js";
import { instagramDirForProduct } from "./productStorage.js";
import {
  loadEffectiveBrandOverlayLayout,
  normalizeBrandOverlayLayout,
} from "./brandOverlaySettingsService.js";

const maximumItems = 50;

export async function createBrandOverlayPreview(input, { layoutOverride = undefined } = {}) {
  const requestedChoices = normalizeChoices(input);
  const item = normalizeItems(input)[0];
  const selection = await requireGeneratedSelection(item);
  const layout = layoutOverride
    ? normalizeBrandOverlayLayout(layoutOverride)
    : await loadEffectiveBrandOverlayLayout(requestedChoices.brandId);
  const choices = resolveDefaultTone(requestedChoices, layout);
  return composeBrandOverlay(selection.generated.path, { ...choices, layout, preview: true });
}

export async function renderBrandOverlays(input, req = undefined) {
  const requestedChoices = normalizeChoices(input);
  const items = normalizeItems(input);
  const layout = await loadEffectiveBrandOverlayLayout(requestedChoices.brandId);
  const choices = resolveDefaultTone(requestedChoices, layout);
  const results = [];

  for (const item of items) {
    try {
      const selection = await requireGeneratedSelection(item);
      const composition = await composeBrandOverlay(selection.generated.path, { ...choices, layout });
      const output = await persistComposition(selection, choices, composition, req);
      results.push({ status: "completed", item, output });
    } catch (error) {
      results.push({
        status: "failed",
        item,
        error: isAppError(error) ? error.message : "تعذر تجهيز هذه الصورة.",
      });
    }
  }

  const outputs = results.filter((result) => result.status === "completed").map((result) => result.output);
  return {
    total: results.length,
    succeeded: outputs.length,
    failed: results.length - outputs.length,
    outputs,
    results,
  };
}

export function normalizeBrandOverlayItems(input) {
  return normalizeItems(input);
}

async function persistComposition(selection, choices, composition, req) {
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const filename = `identity-${safeSegment(selection.generated.role)}-${unique}.png`;
  const outputPath = path.join(instagramDirForProduct(selection.product), filename);
  await writeFileEnsured(outputPath, composition.buffer);
  const now = new Date().toISOString();
  const role = `brand-overlay-${safeSegment(selection.generated.role)}-${unique}`;
  const sizeBytes = await fileSize(outputPath);
  let imageId;
  try {
    imageId = insertInstagramImage(selection.product.id, {
      role,
      filename,
      path: outputPath,
      mimeType: "image/png",
      sizeBytes,
      width: composition.width,
      height: composition.height,
      sourceGeneratedImageId: selection.generated.id,
      sourceRole: selection.generated.role,
      profileId: "native",
      productSku: selection.product.source_product_code || null,
      productPrice: null,
      localPath: outputPath,
      providerMode: "local-overlay",
      outputStage: "output_2",
      outputKind: "brand_overlay",
      isMock: Boolean(selection.generated.is_mock),
      isFinal: true,
      status: "completed",
      completedAt: now,
      overlayBrandId: choices.brandId,
      overlayBrandTone: choices.brandTone,
      overlayResolvedBrandTone: composition.brandTone,
      overlayAlasleeVariant: choices.alasleeVariant,
      overlayCtaText: composition.ctaText,
      overlayLayoutJson: JSON.stringify({ ...composition.layout, layers: composition.layers }),
    });
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
  const relativeUrl = toUploadUrl(outputPath);
  return {
    id: imageId,
    productId: selection.product.id,
    productCode: selection.product.source_product_code || selection.product.id,
    batchId: selection.product.source_batch_id,
    role,
    filename,
    mimeType: "image/png",
    sizeBytes,
    width: composition.width,
    height: composition.height,
    url: req ? absoluteUrl(req, relativeUrl) : relativeUrl,
    path: outputPath,
    finalPath: outputPath,
    sourceGeneratedImageId: selection.generated.id,
    sourceRole: selection.generated.role,
    profileId: "native",
    outputStage: "output_2",
    outputKind: "brand_overlay",
    isMock: Boolean(selection.generated.is_mock),
    isFinal: true,
    providerMode: "local-overlay",
    status: "completed",
    overlayBrandId: choices.brandId,
    overlayBrandTone: choices.brandTone,
    overlayResolvedBrandTone: composition.brandTone,
    overlayAlasleeVariant: choices.alasleeVariant,
    overlayCtaText: composition.ctaText,
    overlayLayout: { ...composition.layout, layers: composition.layers },
    createdAt: now,
    completedAt: now,
  };
}

async function requireGeneratedSelection(item) {
  const product = getProductRecord(item.productId);
  const generated = db.prepare(`
    SELECT * FROM product_generated_images
    WHERE id = ? AND product_id = ?
  `).get(item.generatedImageId, item.productId);
  if (!generated) throw new AppError("الصورة المحددة لا تنتمي إلى هذا المنتج أو لم تعد متاحة.", 404);
  try {
    const stats = await fs.stat(generated.path);
    if (!stats.isFile()) throw new Error("not-file");
  } catch {
    throw new AppError("ملف الصورة المحددة لم يعد متاحاً على الجهاز.", 404);
  }
  return { product, generated };
}

function normalizeChoices(input = {}) {
  return {
    brandId: requireBrandDefinition(input.brandId).id,
    brandTone: input.brandTone ? normalizeBrandTone(input.brandTone) : null,
    alasleeVariant: requireAlasleeVariant(input.alasleeVariant || "golden").id,
    ctaText: normalizeBrandOverlayCta(input.ctaText),
  };
}

function resolveDefaultTone(choices, layout) {
  return {
    ...choices,
    brandTone: choices.brandTone || layout.brandDefaultTone || "auto",
  };
}

function normalizeItems(input = {}) {
  const candidates = Array.isArray(input.items)
    ? input.items
    : [{ productId: input.productId, generatedImageId: input.generatedImageId }];
  if (!candidates.length || candidates.length > maximumItems) {
    throw new AppError(`اختر من صورة واحدة إلى ${maximumItems} صورة.`, 400);
  }
  return candidates.map((item) => {
    const productId = String(item?.productId || "").trim();
    const generatedImageId = Number(item?.generatedImageId);
    if (!productId || !Number.isSafeInteger(generatedImageId) || generatedImageId <= 0) {
      throw new AppError("كل صورة مختارة تحتاج إلى معرّف منتج ومعرّف صورة صحيحين.", 400);
    }
    return { productId, generatedImageId };
  });
}

function safeSegment(value) {
  return String(value || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
}
