// Generates Output 1 ecommerce images incrementally and exposes live progress.

import path from "node:path";
import { config } from "../config.js";
import { createAIProvider } from "../providers/index.js";
import { getGalleryOutputs } from "../prompts/galleryPrompts.js";
import { writeFileEnsured, fileSize } from "../utils/files.js";
import { normalizeGeneratedPng } from "../utils/imageValidation.js";
import { requireSupportedProvider } from "../utils/providerValidation.js";
import { isFreeTestProvider, normalizeProviderName } from "../domain/providers.js";
import { AppError, isAppError } from "../utils/errors.js";
import { generatedDirForProduct } from "./productStorage.js";
import {
  beginProductGeneration,
  getGeneratedRoles,
  getOriginalImagesForGeneration,
  getProductById,
  getProductRecord,
  hasCompleteGallery,
  retainGeneratedRoles,
  setProductFailed,
  setProductGenerated,
  setProductGenerating,
  setProductGenerationRole,
  upsertGeneratedImage,
} from "./productService.js";

export async function generateProductGallery(productId, options = {}) {
  const product = getProductRecord(productId);
  const selectedProvider = requireSupportedProvider(options.provider || product.provider);
  if (isFreeTestProvider(selectedProvider)) {
    throw new AppError("Free Test Output 1 must use the mock Output 1 endpoint.", 400);
  }

  const includeModel = options.includeModel !== false;
  const modelGender = includeModel ? requireModelGender(options.modelGender) : null;
  const allOutputs = await getGalleryOutputs({ includeModel, modelGender });
  const expectedRoles = allOutputs.map((output) => output.role);
  const retryMissing = options.retryMissing === true;

  if (!retryMissing && canUseExistingGallery(productId, product, selectedProvider, expectedRoles, {
    force: options.force, includeModel, modelGender,
  })) {
    return getProductById(productId, options.req);
  }

  if (retryMissing) await retainGeneratedRoles(productId, expectedRoles);
  const completedRoles = new Set(getGeneratedRoles(productId));
  const outputs = retryMissing ? allOutputs.filter((output) => !completedRoles.has(output.role)) : allOutputs;
  if (outputs.length === 0) {
    setProductGenerating(productId, selectedProvider, {
      includeModel, modelGender, expectedCount: expectedRoles.length,
    });
    setProductGenerated(productId, selectedProvider);
    return getProductById(productId, options.req);
  }

  // Validate credentials before clearing an existing gallery.
  const provider = createAIProvider(selectedProvider);
  const originals = getOriginalImagesForGeneration(productId);
  const generatedDir = generatedDirForProduct(product);
  await beginProductGeneration(productId, provider.name, {
    includeModel, modelGender, expectedCount: expectedRoles.length, preserveExisting: retryMissing,
  });
  console.info(`[output-1] ${provider.name} generation started for product ${productId}`);

  let currentRole = null;
  const savedRoles = new Set(retryMissing ? completedRoles : []);
  try {
    const providerImages = await provider.generateImages({
      productId,
      originalImages: originals,
      outputs,
      outputSize: config.outputImageSize,
      onImageStarted: async (role) => {
        currentRole = role;
        setProductGenerationRole(productId, role);
      },
      onImageGenerated: async (image) => {
        const saved = await saveGeneratedImage(product, generatedDir, image);
        await upsertGeneratedImage(productId, saved);
        savedRoles.add(image.role);
        console.info(`[output-1] saved partial ${image.role} for product ${productId}`);
      },
    });

    // Provider adapters are expected to stream callbacks; retain compatibility with adapters that return only a final array.
    for (const image of providerImages) {
      if (savedRoles.has(image.role)) continue;
      const saved = await saveGeneratedImage(product, generatedDir, image);
      await upsertGeneratedImage(productId, saved);
      savedRoles.add(image.role);
    }

    if (!hasCompleteGallery(productId, expectedRoles)) {
      throw new AppError("لم تكتمل كل صور المنتج. أعد محاولة الصور الناقصة.", 502);
    }
    setProductGenerated(productId, provider.name);
    console.info(`[output-1] ${provider.name} generation saved ${savedRoles.size} image(s) for product ${productId}`);
    return getProductById(productId, options.req);
  } catch (error) {
    const publicError = toPublicGenerationError(error, provider.name);
    setProductFailed(productId, publicError, currentRole);
    console.info(`[output-1] ${provider.name} generation failed for product ${productId}: ${publicError.message}`);
    throw publicError;
  }
}

export function getProductOutputProgress(productId, req = undefined) {
  const product = getProductById(productId, req);
  const expectedRoles = product.generation.includeModel ? ["front", "side", "angle", "model"] : ["front", "side", "angle"];
  const byRole = new Map(product.generatedImages.map((image) => [image.role, image]));
  return {
    productId: product.id,
    productCode: product.sourceProductCode || product.id,
    provider: product.provider,
    status: product.status,
    errorMessage: product.errorMessage,
    includeModel: product.generation.includeModel,
    modelGender: product.generation.modelGender,
    startedAt: product.generation.startedAt,
    expectedCount: expectedRoles.length,
    completedCount: expectedRoles.filter((role) => byRole.has(role)).length,
    roles: expectedRoles.map((role) => progressRole(role, byRole.get(role), product)),
  };
}

async function saveGeneratedImage(product, generatedDir, image) {
  const normalized = await normalizeGeneratedPng(image.buffer, config.outputImageSize);
  const filename = `${outputPrefix(product)}-${image.fileSuffix}.png`;
  const filePath = path.join(generatedDir, filename);
  await writeFileEnsured(filePath, normalized.buffer);
  return {
    role: image.role, filename, path: filePath, mimeType: normalized.mimeType,
    width: normalized.width, height: normalized.height, sizeBytes: await fileSize(filePath),
    provider: image.provider, prompt: image.prompt, generationDurationMs: image.generationDurationMs,
  };
}

function progressRole(role, image, product) {
  if (image) return { role, state: "completed", durationMs: image.generationDurationMs, image };
  if (product.status === "failed" && product.generation.currentRole === role) {
    return { role, state: "failed", durationMs: null, errorMessage: product.errorMessage };
  }
  if (product.status === "generating" && product.generation.currentRole === role) {
    return { role, state: "generating", durationMs: null };
  }
  return { role, state: "pending", durationMs: null };
}

function canUseExistingGallery(productId, product, selectedProvider, expectedRoles, settings) {
  if (settings.force) return false;
  if (product.provider && normalizeProviderName(product.provider) !== selectedProvider) return false;
  if (product.generation_include_model !== (settings.includeModel ? 1 : 0)) return false;
  if (settings.includeModel && product.generation_model_gender !== settings.modelGender) return false;
  return hasCompleteGallery(productId, expectedRoles);
}

function requireModelGender(value) {
  if (["male", "female"].includes(value)) return value;
  throw new AppError("اختر هل النظارة رجالية أم نسائية قبل بدء التوليد.", 422, { code: "model_gender_required" });
}

function outputPrefix(product) {
  return product.source_product_code || product.id;
}

function toPublicGenerationError(error, providerName) {
  if (isAppError(error)) return error;
  const status = error?.status || error?.statusCode || error?.response?.status || 502;
  const providerMessage = error?.error?.message || error?.response?.data?.error?.message || error?.message || "Provider request failed.";
  return new AppError(`${providerName} generation failed: ${providerMessage}`, status);
}
