// Manages product upload, retrieval, generation metadata, and serialization.

import crypto from "node:crypto";
import path from "node:path";
import { db } from "../db/database.js";
import { config, storagePaths } from "../config.js";
import { ensureDir, removeFilesBestEffort, writeFileEnsured } from "../utils/files.js";
import { validateUploadedImage, imageRoles, requiredImageRoles } from "../utils/imageValidation.js";
import { AppError } from "../utils/errors.js";
import { toUploadUrl, absoluteUrl } from "../utils/urls.js";
import { INPUT_MODES, PRODUCT_STATUSES } from "../domain/statuses.js";
import { generatedRoleSortValue, originalRoleSortValue } from "../domain/imageRoles.js";
import { insertProductWithOriginals } from "./productWriter.js";
import { listInstagramImages } from "./instagramImageRepository.js";

export async function createProductFromUpload(files) {
  validateUploadFields(files);

  const productId = crypto.randomUUID();
  const now = new Date().toISOString();
  const originalDir = path.join(storagePaths.originalsDir, productId);
  await ensureDir(originalDir);

  const validatedImages = [];
  for (const role of imageRoles) {
    const file = files?.[role]?.[0];
    if (!file) {
      continue;
    }

    const image = await validateUploadedImage(file, role, config.maxImageBytes);
    const filename = `${role}.${image.extension}`;
    const filePath = path.join(originalDir, filename);
    await writeFileEnsured(filePath, image.buffer);

    validatedImages.push({
      ...image,
      filename,
      path: filePath,
    });
  }

  insertProductWithOriginals({
    product: {
      id: productId,
      status: PRODUCT_STATUSES.UPLOADED,
      inputMode: INPUT_MODES.SINGLE_UPLOAD,
      brandingEnabled: false,
      now,
      actor: "system",
    },
    originals: validatedImages,
  });

  return getProductById(productId);
}

export function getProductById(productId, req = undefined) {
  const product = getProductRecord(productId);

  const originals = db
    .prepare("SELECT * FROM product_original_images WHERE product_id = ?")
    .all(productId)
    .sort((a, b) => originalRoleSortValue(a.role) - originalRoleSortValue(b.role));

  const generated = db
    .prepare("SELECT * FROM product_generated_images WHERE product_id = ?")
    .all(productId)
    .sort((a, b) => generatedRoleSortValue(a.role) - generatedRoleSortValue(b.role));
  const instagram = listInstagramImages(productId);

  return serializeProduct(product, originals, generated, instagram, req);
}

export function getProductRecord(productId) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) {
    throw new AppError("Product not found.", 404);
  }

  return product;
}

export function getProductGallery(productId, req = undefined) {
  const product = getProductById(productId, req);

  return {
    id: product.id,
    provider: product.provider,
    status: product.status,
    generatedAt: product.generatedAt,
    gallery: product.generatedImages,
  };
}

export function getOriginalImagesForGeneration(productId) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) {
    throw new AppError("Product not found.", 404);
  }

  const originals = db
    .prepare("SELECT * FROM product_original_images WHERE product_id = ?")
    .all(productId)
    .sort((a, b) => originalRoleSortValue(a.role) - originalRoleSortValue(b.role));

  for (const role of requiredImageRoles) {
    if (!originals.some((image) => image.role === role)) {
      throw new AppError(`Product is missing required ${role} image.`, 409);
    }
  }

  return originals.map((image) => ({
    role: image.role,
    filename: image.filename,
    path: image.path,
    mimeType: image.mime_type,
    width: image.width,
    height: image.height,
    sizeBytes: image.size_bytes,
  }));
}

export function setProductGenerating(productId, provider) {
  db.prepare(`
    UPDATE products
    SET status = 'generating', provider = ?, error_message = NULL, updated_at = ?
    WHERE id = ?
  `).run(provider, new Date().toISOString(), productId);
}

export function setProductGenerated(productId, provider) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE products
    SET status = 'generated', provider = ?, generated_at = ?, updated_at = ?, error_message = NULL
    WHERE id = ?
  `).run(provider, now, now, productId);
}

export function setProductFailed(productId, error) {
  db.prepare(`
    UPDATE products
    SET status = 'failed', error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(error.message || "Generation failed.", new Date().toISOString(), productId);
}

export async function replaceGeneratedImages(productId, generatedImages) {
  const now = new Date().toISOString();
  const existingPaths = db
    .prepare("SELECT path FROM product_generated_images WHERE product_id = ?")
    .all(productId)
    .map((row) => row.path);
  const deleteExisting = db.prepare("DELETE FROM product_generated_images WHERE product_id = ?");
  const insertGenerated = db.prepare(`
    INSERT INTO product_generated_images
      (product_id, role, filename, path, mime_type, size_bytes, width, height, provider, prompt,
       output_stage, output_kind, is_mock, created_at)
    VALUES
      (@productId, @role, @filename, @path, @mimeType, @sizeBytes, @width, @height, @provider, @prompt,
       @outputStage, @outputKind, @isMock, @now)
  `);

  db.transaction(() => {
    deleteExisting.run(productId);
    for (const image of generatedImages) {
      insertGenerated.run({
        productId,
        role: image.role,
        filename: image.filename,
        path: image.path,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height,
        provider: image.provider,
        prompt: image.prompt || "",
        outputStage: image.outputStage || "output_1",
        outputKind: image.outputKind || "real_ai",
        isMock: image.isMock ? 1 : 0,
        now,
      });
    }
  })();

  await removeFilesBestEffort(existingPaths, generatedImages.map((image) => image.path));
}

export function hasCompleteGallery(productId, expectedRoles) {
  const rows = db
    .prepare("SELECT role FROM product_generated_images WHERE product_id = ?")
    .all(productId);
  const actualRoles = new Set(rows.map((row) => row.role));

  return rows.length === expectedRoles.length && expectedRoles.every((role) => actualRoles.has(role));
}

function validateUploadFields(files) {
  for (const role of requiredImageRoles) {
    if (!files?.[role]?.[0]) {
      throw new AppError(`Missing required upload field "${role}".`, 400);
    }
  }

  for (const field of Object.keys(files || {})) {
    if (!imageRoles.includes(field)) {
      throw new AppError(`Unsupported upload field "${field}".`, 400);
    }
  }
}

function serializeProduct(product, originals, generated, instagram, req) {
  return {
    id: product.id,
    provider: product.provider,
    status: product.status,
    sourceProductCode: product.source_product_code,
    sourceBatchId: product.source_batch_id,
    sourceFolder: product.source_folder,
    inputMode: product.input_mode,
    brandingEnabled: Boolean(product.branding_enabled),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    generatedAt: product.generated_at,
    errorMessage: product.error_message,
    originalImages: originals.map((image) => serializeImage(image, req, product)),
    generatedImages: generated.map((image) => serializeImage(image, req, product)),
    instagramImages: instagram.map((image) => serializeImage(image, req, product)),
  };
}

function serializeImage(image, req, product = undefined) {
  const relativeUrl = toUploadUrl(image.path);

  return {
    id: image.id,
    productId: image.product_id,
    productCode: product?.source_product_code || product?.id,
    batchId: product?.source_batch_id,
    role: image.role,
    filename: image.filename,
    mimeType: image.mime_type,
    sizeBytes: image.size_bytes,
    width: image.width,
    height: image.height,
    url: req ? absoluteUrl(req, relativeUrl) : relativeUrl,
    path: image.path,
    finalPath: image.output_stage === "output_2" ? image.path : undefined,
    provider: image.provider,
    prompt: image.prompt,
    outputStage: image.output_stage,
    outputKind: image.output_kind,
    isMock: Boolean(image.is_mock),
    isFinal: image.is_final === undefined ? undefined : Boolean(image.is_final),
    sourceGeneratedImageId: image.source_generated_image_id,
    sourceRole: image.source_role,
    profileId: image.profile_id,
    productSku: image.product_sku,
    productPrice: image.product_price,
    localPath: image.local_path,
    priceLabelReferencePath: image.price_label_reference_path,
    priceLabelProvider: image.price_label_provider,
    priceLabelModel: image.price_label_model,
    priceLabelPrompt: image.price_label_prompt,
    providerMode: image.provider_mode,
    status: image.status,
    errorMessage: image.error_message,
    createdAt: image.created_at,
    updatedAt: image.updated_at,
    completedAt: image.completed_at,
  };
}
