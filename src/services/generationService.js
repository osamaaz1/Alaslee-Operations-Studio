// Generates Output 1 ecommerce images only; Instagram preparation is a separate workflow.

import path from "node:path";
import { config } from "../config.js";
import { createAIProvider } from "../providers/index.js";
import { getGalleryOutputs, galleryOutputs as galleryOutputDefaults } from "../prompts/galleryPrompts.js";
import { writeFileEnsured, fileSize } from "../utils/files.js";
import { normalizeGeneratedPng } from "../utils/imageValidation.js";
import { requireSupportedProvider } from "../utils/providerValidation.js";
import { isFreeTestProvider, normalizeProviderName } from "../domain/providers.js";
import { AppError, isAppError } from "../utils/errors.js";
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

export async function generateProductGallery(productId, options = {}) {
  const product = getProductRecord(productId);
  const selectedProvider = requireSupportedProvider(options.provider || product.provider);
  if (isFreeTestProvider(selectedProvider)) {
    throw new AppError("Free Test Output 1 must use the mock Output 1 endpoint.", 400);
  }
  if (canUseExistingGallery(productId, product, selectedProvider, options.force)) {
    return getProductById(productId, options.req);
  }

  const provider = createAIProvider(selectedProvider);
  const originals = getOriginalImagesForGeneration(productId);
  const generatedDir = generatedDirForProduct(product);

  setProductGenerating(productId, provider.name);
  console.info(`[output-1] ${provider.name} generation started for product ${productId}`);

  try {
    const outputs = await getGalleryOutputs();
    const savedImages = [];
    const providerImages = await provider.generateImages({
      productId,
      originalImages: originals,
      outputs,
      outputSize: config.outputImageSize,
      onImageGenerated: async (image) => {
        const saved = await saveGeneratedImage(product, generatedDir, image);
        savedImages.push(saved);
        replaceGeneratedImages(productId, savedImages);
        console.info(`[output-1] saved partial ${image.role} for product ${productId}`);
      },
    });

    if (savedImages.length === 0) {
      for (const image of providerImages) {
        savedImages.push(await saveGeneratedImage(product, generatedDir, image));
      }
    }

    await replaceGeneratedImages(productId, savedImages);
    setProductGenerated(productId, provider.name);
    console.info(`[output-1] ${provider.name} generation saved ${savedImages.length} image(s) for product ${productId}`);

    return getProductById(productId, options.req);
  } catch (error) {
    const publicError = toPublicGenerationError(error, provider.name);
    setProductFailed(productId, publicError);
    console.info(`[output-1] ${provider.name} generation failed for product ${productId}: ${publicError.message}`);
    throw publicError;
  }
}

async function saveGeneratedImage(product, generatedDir, image) {
  const normalized = await normalizeGeneratedPng(image.buffer, config.outputImageSize);
  const filename = `${outputPrefix(product)}-${image.fileSuffix}.png`;
  const filePath = path.join(generatedDir, filename);
  await writeFileEnsured(filePath, normalized.buffer);

  return {
    role: image.role,
    filename,
    path: filePath,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    sizeBytes: await fileSize(filePath),
    provider: image.provider,
    prompt: image.prompt,
  };
}

function canUseExistingGallery(productId, product, selectedProvider, force) {
  if (force) return false;
  if (product.provider && normalizeProviderName(product.provider) !== selectedProvider) return false;
  return hasCompleteGallery(productId, galleryOutputDefaults.map((output) => output.role));
}

function outputPrefix(product) {
  return product.source_product_code || product.id;
}

function toPublicGenerationError(error, providerName) {
  if (isAppError(error)) {
    return error;
  }

  const status = error?.status || error?.statusCode || error?.response?.status || 502;
  const providerMessage =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "Provider request failed.";

  return new AppError(`${providerName} generation failed: ${providerMessage}`, status);
}
