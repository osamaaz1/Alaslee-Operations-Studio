// Persists product rows and their original image metadata.

import { db } from "../db/database.js";

export function insertProductWithOriginals({ product, originals }) {
  const insertProduct = db.prepare(productSql);
  const insertOriginal = db.prepare(originalSql);

  db.transaction(() => {
    insertProduct.run(productRow(product));
    for (const image of originals) {
      insertOriginal.run(originalRow(product, image));
    }
  })();
}

function productRow(product) {
  return {
    id: product.id,
    status: product.status,
    provider: product.provider || null,
    sourceProductCode: product.sourceProductCode || null,
    sourceBatchId: product.sourceBatchId || null,
    sourceFolder: product.sourceFolder || null,
    inputMode: product.inputMode,
    brandingEnabled: product.brandingEnabled ? 1 : 0,
    now: product.now,
    actor: product.actor,
  };
}

function originalRow(product, image) {
  return {
    productId: product.id,
    role: image.role,
    filename: image.filename,
    path: image.path,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    width: image.width,
    height: image.height,
    sourceFilename: image.sourceFilename || image.filename,
    sourcePath: image.sourcePath || image.path,
    sourceMimeType: image.sourceMimeType || image.mimeType,
    sourceSizeBytes: image.sourceSizeBytes || image.sizeBytes,
    sourceWidth: image.sourceWidth || image.width,
    sourceHeight: image.sourceHeight || image.height,
    optimizationApplied: image.optimizationApplied ? 1 : 0,
    now: product.now,
    actor: product.actor,
  };
}

const productSql = `
  INSERT INTO products
    (id, status, provider, source_product_code, source_batch_id, source_folder,
     input_mode, branding_enabled, created_at, updated_at, created_by, updated_by)
  VALUES
    (@id, @status, @provider, @sourceProductCode, @sourceBatchId, @sourceFolder,
     @inputMode, @brandingEnabled, @now, @now, @actor, @actor)
`;

const originalSql = `
  INSERT INTO product_original_images
    (product_id, role, filename, path, mime_type, size_bytes, width, height,
     source_filename, source_path, source_mime_type, source_size_bytes, source_width, source_height, optimization_applied,
     created_at, updated_at, created_by, updated_by)
  VALUES
    (@productId, @role, @filename, @path, @mimeType, @sizeBytes, @width, @height,
     @sourceFilename, @sourcePath, @sourceMimeType, @sourceSizeBytes, @sourceWidth, @sourceHeight, @optimizationApplied,
     @now, @now, @actor, @actor)
`;
