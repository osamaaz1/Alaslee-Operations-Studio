// Runs Output 2 Instagram preparation from manually selected Output 1 images.

import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { db } from "../db/database.js";
import { isFreeTestProvider, isSupportedProvider, normalizeProviderName } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";
import { fileSize, writeFileEnsured } from "../utils/files.js";
import { requireBrandingAssetPaths, requirePriceLabelReferencePath } from "./brandingAssetService.js";
import { getCompositionFormat, getCompositionSettingsDocument } from "./compositionSettingsService.js";
import { composeInstagramImage } from "./instagramCompositionService.js";
import { insertInstagramImage } from "./instagramImageRepository.js";
import { createInstagramAttempt, updateInstagramAttempt } from "./instagramAttemptRepository.js";
import { PriceLabelEditService } from "./priceLabelEditService.js";
import { instagramDirForProduct } from "./productStorage.js";

export async function generateExplicitInstagramImages(input = {}) {
  const request = validateRequestShape(input);
  const profile = await resolveProfile(request.profileId);
  console.info(`[instagram] validating ${request.items.length} selected image(s)`);
  const selections = validateSelections(request, input.expectedBatchId);
  const assets = await requireBrandingAssetPaths();
  const needsPriceLabel = selections.some((selection) => !selection.isFreeTest);
  const priceLabelReferencePath = needsPriceLabel ? await requirePriceLabelReferencePath() : null;
  const editor = needsPriceLabel ? new PriceLabelEditService() : null;
  const results = [];

  for (const selection of selections) {
    results.push(await generateOne(selection, assets, priceLabelReferencePath, profile, editor));
  }

  return summarizeResults(results);
}

async function generateOne(selection, assets, priceLabelReferencePath, profile, editor) {
  const activeReferencePath = selection.isFreeTest ? null : priceLabelReferencePath;
  const activeEditor = selection.isFreeTest ? null : editor;
  const attemptId = createAttempt(selection, profile, activeReferencePath, activeEditor);
  let localPath = null;

  try {
    console.info(`[instagram] local composition started for image ${selection.generated.id}`);
    const local = await createLocalImage(selection, assets, profile, attemptId);
    localPath = local.path;

    if (selection.isFreeTest) {
      const preview = await saveFinalImage(selection, profile, attemptId, local.buffer, "preview");
      await saveSuccessfulMetadata(selection, profile, attemptId, localPath, preview, null, null);
      console.info(`[instagram] saved Free Test local preview for attempt ${attemptId}`);
      return successResult(selection, preview, attemptId);
    }

    console.info(`[instagram] GPT price insertion started for attempt ${attemptId}`);
    const edited = await activeEditor.addPriceLabel({
      composedPath: localPath,
      referencePath: activeReferencePath,
      price: selection.meta.price,
      dimensions: profile.output,
    });
    const final = await saveFinalImage(selection, profile, attemptId, edited.buffer);
    await saveSuccessfulMetadata(selection, profile, attemptId, localPath, final, edited, activeReferencePath);
    console.info(`[instagram] saved final output for attempt ${attemptId}`);
    return successResult(selection, final, attemptId);
  } catch (error) {
    updateFailure(attemptId, selection, localPath, activeReferencePath, activeEditor, error);
    console.info(`[instagram] attempt ${attemptId} failed: ${error.message}`);
    return failureResult(selection, error, attemptId);
  }
}

function validateRequestShape(input) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError("Select at least one generated ecommerce image.", 400);
  }

  const profileId = String(input.profileId || "").trim();
  if (!profileId) {
    throw new AppError("Select an Instagram output profile.", 400);
  }

  return {
    profileId,
    items: input.items,
    products: input.products || {},
  };
}

function validateSelections(request, expectedBatchId) {
  const products = productsById(request.items.map((item) => String(item.productId || "")));
  const generatedImages = generatedImagesById(request.items.map((item) => Number(item.generatedImageId)));

  return request.items.map((item) => {
    const productId = String(item.productId || "");
    const product = products.get(productId);
    if (!product) {
      throw new AppError("Product not found.", 404);
    }
    if (expectedBatchId && product.source_batch_id !== expectedBatchId) {
      throw new AppError("Selected product does not belong to this batch.", 400);
    }

    const generated = getGeneratedImage(generatedImages, Number(item.generatedImageId), product.id);
    const meta = productMeta(request.products, product.id);
    const providerMode = outputProviderMode(product, generated);
    const freeTest = isFreeTestProvider(providerMode);
    return {
      product,
      generated,
      meta,
      providerMode,
      isFreeTest: freeTest,
      isMock: freeTest || Boolean(generated.is_mock),
    };
  });
}

function productsById(productIds) {
  const ids = uniqueValues(productIds.filter(Boolean));
  if (ids.length === 0) return new Map();
  const rows = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders(ids)})`).all(...ids);
  return new Map(rows.map((product) => [product.id, product]));
}

function generatedImagesById(generatedImageIds) {
  const ids = uniqueValues(generatedImageIds.filter(Number.isInteger));
  if (ids.length === 0) return new Map();
  const rows = db.prepare(`SELECT * FROM product_generated_images WHERE id IN (${placeholders(ids)})`).all(...ids);
  return new Map(rows.map((image) => [image.id, image]));
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function productMeta(products, productId) {
  const meta = products[productId] || {};
  const price = cleanMetadataValue(meta.price, "Price");
  const sku = cleanMetadataValue(meta.sku, "SKU");
  if (!price || !sku) {
    throw new AppError("Price and SKU are required for every selected product.", 400);
  }

  return { price, sku };
}

function cleanMetadataValue(value, label) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 80) {
    throw new AppError(`${label} must be 80 characters or fewer.`, 400);
  }
  if (/[\r\n\t]/.test(text)) {
    throw new AppError(`${label} must be a single-line value.`, 400);
  }

  return text;
}

function getGeneratedImage(generatedImages, generatedImageId, productId) {
  if (!Number.isInteger(generatedImageId)) {
    throw new AppError("Each selected image must include a valid generatedImageId.", 400);
  }

  const image = generatedImages.get(generatedImageId);
  if (!image || image.product_id !== productId) {
    throw new AppError("Selected generated image does not belong to the selected product.", 400);
  }
  if (!existsSync(image.path)) {
    throw new AppError("Selected generated image file is missing. Regenerate ecommerce images first.", 409);
  }

  return image;
}

function outputProviderMode(product, generated) {
  const providerMode = normalizeProviderName(generated.provider || product.provider);
  if (!isSupportedProvider(providerMode)) {
    throw new AppError("Selected Output 1 image has an unsupported provider mode.", 400);
  }

  return providerMode;
}

async function resolveProfile(profileId) {
  const document = await getCompositionSettingsDocument();
  const format = getCompositionFormat(profileId);
  return {
    id: format.id,
    output: { width: format.width, height: format.height },
    settings: document.profiles?.[format.id] || document.settings,
  };
}

function createAttempt(selection, profile, referencePath, editor) {
  return createInstagramAttempt({
    productId: selection.product.id,
    sourceGeneratedImageId: selection.generated.id,
    sourceRole: selection.generated.role,
    profileId: profile.id,
    productSku: selection.meta.sku,
    productPrice: selection.meta.price,
    priceLabelReferencePath: referencePath,
    priceLabelProvider: editor?.provider || null,
    priceLabelModel: editor?.model || null,
    providerMode: selection.providerMode,
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
    status: "processing",
  });
}

async function createLocalImage(selection, assets, profile, attemptId) {
  const composed = await composeInstagramImage(selection.generated.path, assets, profile.settings, profile.output);
  const localPath = outputPath(selection, profile, attemptId, "local");
  await writeFileEnsured(localPath, composed.buffer);
  return { ...composed, path: localPath };
}

async function saveFinalImage(selection, profile, attemptId, buffer, stage = "final") {
  const finalPath = outputPath(selection, profile, attemptId, stage);
  const normalized = await normalizeFinal(buffer, profile.output);
  await writeFileEnsured(finalPath, normalized.buffer);
  return { ...normalized, path: finalPath };
}

async function normalizeFinal(buffer, dimensions) {
  const result = await sharp(buffer, { failOn: "error" })
    .resize(dimensions.width, dimensions.height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: result.data, width: result.info.width, height: result.info.height };
}

async function saveSuccessfulMetadata(selection, profile, attemptId, localPath, final, edited, referencePath) {
  const now = new Date().toISOString();
  const filename = path.basename(final.path);
  insertInstagramImage(selection.product.id, {
    role: `instagram-${selection.generated.role}-${profile.id}-${attemptId}`,
    filename,
    path: final.path,
    mimeType: "image/png",
    sizeBytes: await fileSize(final.path),
    width: final.width,
    height: final.height,
    sourceGeneratedImageId: selection.generated.id,
    sourceRole: selection.generated.role,
    profileId: profile.id,
    productSku: selection.meta.sku,
    productPrice: selection.meta.price,
    localPath,
    priceLabelReferencePath: referencePath,
    priceLabelProvider: edited?.provider || null,
    priceLabelModel: edited?.model || null,
    priceLabelPrompt: edited?.prompt || null,
    providerMode: selection.providerMode,
    outputStage: "output_2",
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
    status: "completed",
    errorMessage: null,
    completedAt: now,
  });
  updateInstagramAttempt(attemptId, successfulAttempt(selection, localPath, final.path, edited, referencePath, now));
}

function successfulAttempt(selection, localPath, finalPath, edited, referencePath, completedAt) {
  return {
    status: "completed",
    localPath,
    finalPath,
    priceLabelReferencePath: referencePath,
    priceLabelProvider: edited?.provider || null,
    priceLabelModel: edited?.model || null,
    priceLabelPrompt: edited?.prompt || null,
    providerMode: selection.providerMode,
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
    completedAt,
  };
}

function updateFailure(attemptId, selection, localPath, referencePath, editor, error) {
  updateInstagramAttempt(attemptId, {
    status: "failed",
    localPath,
    priceLabelReferencePath: referencePath,
    priceLabelProvider: editor?.provider || null,
    priceLabelModel: editor?.model || null,
    providerMode: selection.providerMode,
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
    errorMessage: error.message || "Instagram generation failed.",
  });
}

function outputKind(selection) {
  return selection.isFreeTest ? "local_preview" : "final_ai";
}

function outputPath(selection, profile, attemptId, stage) {
  const dir = instagramDirForProduct(selection.product);
  const filename = [
    "instagram",
    selection.generated.role,
    profile.id,
    stage,
    attemptId,
  ].join("-");
  return path.join(dir, `${filename}.png`);
}

function successResult(selection, final, attemptId) {
  return {
    success: true,
    attemptId,
    productId: selection.product.id,
    generatedImageId: selection.generated.id,
    finalPath: final.path,
    width: final.width,
    height: final.height,
    providerMode: selection.providerMode,
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
  };
}

function failureResult(selection, error, attemptId) {
  return {
    success: false,
    attemptId,
    productId: selection.product.id,
    generatedImageId: selection.generated.id,
    providerMode: selection.providerMode,
    outputKind: outputKind(selection),
    isMock: selection.isMock,
    isFinal: !selection.isFreeTest,
    error: error.message || "Instagram generation failed.",
  };
}

function summarizeResults(results) {
  return {
    results,
    successful: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
  };
}
