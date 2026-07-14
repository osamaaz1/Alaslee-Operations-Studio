// Saves user-provided images as ready Output 1 sources for Instagram preparation.

import crypto from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { INPUT_MODES, PRODUCT_STATUSES } from "../domain/statuses.js";
import { PROVIDERS } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";
import { fileSize, writeFileEnsured } from "../utils/files.js";
import { validateUploadedImage } from "../utils/imageValidation.js";
import { insertProductWithOriginals } from "./productWriter.js";
import { generatedDirForProduct } from "./productStorage.js";
import { getProductById, replaceGeneratedImages, setProductGenerated } from "./productService.js";

const maxDirectUploads = 12;

export async function createDirectInstagramUpload(files = [], options = {}) {
  const uploads = Array.isArray(files) ? files.filter((file) => file?.size > 0) : [];
  if (uploads.length === 0) {
    throw new AppError("Choose at least one Instagram source image.", 400);
  }
  if (uploads.length > maxDirectUploads) {
    throw new AppError(`Upload ${maxDirectUploads} Instagram source images or fewer.`, 400);
  }

  const validatedUploads = await validateDirectUploads(uploads);
  const productId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceProductCode = `direct-instagram-${productId.slice(0, 8)}`;
  const product = {
    id: productId,
    status: PRODUCT_STATUSES.UPLOADED,
    provider: PROVIDERS.GPT,
    sourceProductCode,
    inputMode: INPUT_MODES.INSTAGRAM_DIRECT_UPLOAD,
    brandingEnabled: true,
    now,
    actor: "system",
  };

  insertProductWithOriginals({ product, originals: [] });
  const generatedImages = await saveDirectSources(product, validatedUploads);
  await replaceGeneratedImages(productId, generatedImages);
  setProductGenerated(productId, PROVIDERS.GPT);

  console.info(`[instagram] saved ${generatedImages.length} direct source image(s) for ${productId}`);
  return getProductById(productId, options.req);
}

async function validateDirectUploads(uploads) {
  const validated = [];
  for (const [index, file] of uploads.entries()) {
    validated.push(await validateUploadedImage(file, `Instagram source ${index + 1}`, config.maxImageBytes));
  }
  return validated;
}

async function saveDirectSources(product, uploads) {
  const outputDir = generatedDirForProduct(product);
  const saved = [];

  for (const [index, validated] of uploads.entries()) {
    const number = index + 1;
    const role = `direct-${number}`;
    const filename = `${role}.${validated.extension}`;
    const filePath = path.join(outputDir, filename);
    await writeFileEnsured(filePath, validated.buffer);

    saved.push({
      role,
      filename,
      path: filePath,
      mimeType: validated.mimeType,
      sizeBytes: await fileSize(filePath),
      width: validated.width,
      height: validated.height,
      provider: PROVIDERS.GPT,
      prompt: "Direct Instagram source upload",
      outputStage: "output_1",
      outputKind: "direct_upload",
      isMock: false,
    });
  }

  return saved;
}
