// Generates all queued products in a batch sequentially.

import { BATCH_STATUSES } from "../domain/statuses.js";
import { isFreeTestProvider } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";
import { generateProductGallery } from "./generationService.js";
import { getBatchById, listBatchProducts, updateBatchStatus } from "./batchRepository.js";
import { createMockOutputOneForProducts } from "./freeTestOutputService.js";

export async function generateBatch(batchId, options = {}) {
  const batch = getBatchById(batchId);
  if (!batch) {
    throw new AppError("Batch not found.", 404);
  }

  const products = listBatchProducts(batchId);
  if (products.length === 0) {
    throw new AppError("Batch does not contain products.", 409);
  }

  updateBatchStatus(batchId, BATCH_STATUSES.GENERATING);
  const results = isFreeTestProvider(batch.provider)
    ? await createMockOutputOneForProducts(products, { force: options.force === true })
    : await generateProducts(products, batch, options);
  const status = batchStatusFromCounts(results.successful, results.failed);

  updateBatchStatus(batchId, status, {
    successfulProducts: results.successful,
    failedProducts: results.failed,
  });

  return {
    batch: getBatchById(batchId),
    products: listBatchProducts(batchId),
    results,
  };
}

async function generateProducts(products, batch, options) {
  let successful = 0;
  let failed = 0;

  for (const product of products) {
    try {
      await generateProductGallery(product.id, {
        provider: batch.provider,
        force: options.force === true,
      });
      successful += 1;
    } catch {
      failed += 1;
    }
  }

  return { successful, failed, total: products.length };
}

function batchStatusFromCounts(successful, failed) {
  if (successful > 0 && failed === 0) return BATCH_STATUSES.GENERATED;
  if (successful > 0 && failed > 0) return BATCH_STATUSES.PARTIAL;
  return BATCH_STATUSES.FAILED;
}
