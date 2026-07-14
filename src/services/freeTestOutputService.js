// Creates local mock Output 1 images without calling any AI provider.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { PROVIDERS } from "../domain/providers.js";
import { galleryOutputs } from "../prompts/galleryPrompts.js";
import { AppError, isAppError } from "../utils/errors.js";
import { fileSize, writeFileEnsured } from "../utils/files.js";
import { normalizeGeneratedPng, validateUploadedImage } from "../utils/imageValidation.js";
import { generatedDirForProduct } from "./productStorage.js";
import {
  getOriginalImagesForGeneration,
  getProductById,
  getProductRecord,
  hasCompleteGallery,
  replaceGeneratedImages,
  setProductFailed,
  setProductGenerated,
  setProductGenerating,
} from "./productService.js";

export async function createMockOutputOne(productId, files = {}, options = {}) {
  const product = getProductRecord(productId);
  const outputs = options.includeModel === false ? galleryOutputs.filter((output) => output.role !== "model") : galleryOutputs;
  const mockOutputRoles = outputs.map((output) => output.role);
  if (!options.force && product.provider === PROVIDERS.FREE_TEST && hasCompleteGallery(productId, mockOutputRoles)) {
    return getProductById(productId, options.req);
  }

  setProductGenerating(productId, PROVIDERS.FREE_TEST, { includeModel: outputs.some((output) => output.role === "model"), expectedCount: outputs.length });

  try {
    const sources = hasMockUploads(files, mockOutputRoles) ? await uploadedMockSources(files, mockOutputRoles) : await originalReferenceSources(productId, mockOutputRoles);
    const savedImages = await saveMockOutputs(product, sources, outputs);
    await replaceGeneratedImages(productId, savedImages);
    setProductGenerated(productId, PROVIDERS.FREE_TEST);
    console.info(`[output-1] Free Test mock Output 1 saved for product ${productId}`);
    return getProductById(productId, options.req);
  } catch (error) {
    const publicError = isAppError(error)
      ? error
      : new AppError(`Free Test mock Output 1 failed: ${error.message || "Image processing failed."}`, 500);
    setProductFailed(productId, publicError);
    throw publicError;
  }
}

export async function createMockOutputOneForProducts(products, options = {}) {
  let successful = 0;
  let failed = 0;

  for (const product of products) {
    try {
      await createMockOutputOne(product.id, {}, options);
      successful += 1;
    } catch {
      failed += 1;
    }
  }

  return { successful, failed, total: products.length };
}

function hasMockUploads(files = {}, roles) {
  return roles.some((role) => Boolean(files?.[role]?.[0]));
}

async function uploadedMockSources(files, roles) {
  for (const field of Object.keys(files || {})) {
    if (!roles.includes(field)) {
      throw new AppError(`Unsupported mock Output 1 field "${field}".`, 400);
    }
  }

  const missing = roles.filter((role) => !files?.[role]?.[0]);
  if (missing.length > 0) {
    throw new AppError(`Free Test mock Output 1 requires: ${missing.join(", ")}.`, 400);
  }

  const sources = new Map();
  for (const role of roles) {
    const validated = await validateUploadedImage(files[role][0], `${role} mock`, config.maxImageBytes);
    sources.set(role, validated.buffer);
  }
  return sources;
}

async function originalReferenceSources(productId, roles) {
  const originals = getOriginalImagesForGeneration(productId);
  const byRole = new Map(originals.map((image) => [image.role, image]));
  const roleSource = {
    front: "front",
    side: "side",
    angle: "angle",
    model: byRole.has("angle") ? "angle" : "front",
  };
  const sources = new Map();

  for (const [outputRole, originalRole] of Object.entries(roleSource).filter(([role]) => roles.includes(role))) {
    const source = byRole.get(originalRole);
    if (!source) {
      throw new AppError(`Cannot create mock Output 1 because ${originalRole} reference is missing.`, 409);
    }
    sources.set(outputRole, await fs.readFile(source.path));
  }

  return sources;
}

async function saveMockOutputs(product, sources, outputs) {
  const generatedDir = generatedDirForProduct(product);
  const savedImages = [];

  for (const output of outputs) {
    const normalized = await normalizeGeneratedPng(sources.get(output.role), config.outputImageSize);
    const filename = `${outputPrefix(product)}-mock-${output.fileSuffix}.png`;
    const filePath = path.join(generatedDir, filename);
    await writeFileEnsured(filePath, normalized.buffer);

    savedImages.push({
      role: output.role,
      filename,
      path: filePath,
      mimeType: normalized.mimeType,
      width: normalized.width,
      height: normalized.height,
      sizeBytes: await fileSize(filePath),
      provider: PROVIDERS.FREE_TEST,
      prompt: "Free Test / Mock Output 1",
      outputStage: "output_1",
      outputKind: "mock_output_1",
      isMock: true,
    });
  }

  return savedImages;
}

function outputPrefix(product) {
  return product.source_product_code || product.id;
}
