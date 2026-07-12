// Reads and writes batch rows and batch product lists.

import { db } from "../db/database.js";
import { BATCH_STATUSES } from "../domain/statuses.js";

export function insertBatch({ id, sourceFolder, provider, brandingEnabled, totalProducts, actor }) {
  const now = new Date().toISOString();
  db.prepare(batchInsertSql).run({
    id,
    sourceFolder,
    provider,
    status: BATCH_STATUSES.IMPORTED,
    brandingEnabled: brandingEnabled ? 1 : 0,
    totalProducts,
    now,
    actor,
  });
}

export function getBatchById(batchId) {
  return db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
}

export function listBatchProducts(batchId) {
  return db.prepare(productListSql).all(batchId);
}

export function updateBatchStatus(batchId, status, counts = {}) {
  db.prepare(batchStatusSql).run({
    status,
    successfulProducts: counts.successfulProducts || 0,
    failedProducts: counts.failedProducts || 0,
    errorMessage: counts.errorMessage || null,
    now: new Date().toISOString(),
    batchId,
  });
}

const batchInsertSql = `
  INSERT INTO batches
    (id, source_folder, provider, status, branding_enabled, total_products,
     successful_products, failed_products, created_at, updated_at, created_by, updated_by)
  VALUES
    (@id, @sourceFolder, @provider, @status, @brandingEnabled, @totalProducts,
     0, 0, @now, @now, @actor, @actor)
`;

const productListSql = `
  SELECT id, provider, status, source_product_code, input_mode, branding_enabled,
         generated_at, error_message, created_at, updated_at
  FROM products
  WHERE source_batch_id = ?
  ORDER BY CAST(source_product_code AS INTEGER), source_product_code
`;

const batchStatusSql = `
  UPDATE batches
  SET status = @status,
      successful_products = @successfulProducts,
      failed_products = @failedProducts,
      error_message = @errorMessage,
      updated_at = @now
  WHERE id = @batchId
`;
