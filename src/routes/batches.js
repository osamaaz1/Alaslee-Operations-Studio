// Exposes batch import, lookup, and generation endpoints.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { importBatchFromFolder } from "../services/batchImportService.js";
import { generateBatch } from "../services/batchGenerationService.js";
import { getBatchById, listBatchProducts } from "../services/batchRepository.js";
import { generateExplicitInstagramImages } from "../services/explicitInstagramGenerationService.js";
import { isFreeTestProvider } from "../domain/providers.js";
import { estimateBatchOutputOneCost } from "../services/outputCostEstimateService.js";

export const batchesRouter = Router();

batchesRouter.post(
  "/import-folder",
  asyncHandler(async (req, res) => {
    const folderPath = requireBodyString(req.body?.folderPath, "folderPath");
    const result = await importBatchFromFolder({
      folderPath,
      provider: req.body?.provider,
      brandingEnabled: req.body?.brandingEnabled === true,
    });

    sendSuccess(res, result, 201);
  }),
);

batchesRouter.post(
  "/:id/generate",
  asyncHandler(async (req, res) => {
    const result = await generateBatch(req.params.id, {
      force: req.body?.force === true,
    });

    sendSuccess(res, result);
  }),
);

batchesRouter.post(
  "/:id/output-1/mock",
  asyncHandler(async (req, res) => {
    const batch = getBatchOrThrow(req.params.id);
    if (!isFreeTestProvider(batch.provider)) {
      throw new AppError("Mock Output 1 is only available for Free Test batches.", 400);
    }

    const result = await generateBatch(req.params.id, {
      force: req.body?.force === true,
    });

    sendSuccess(res, result);
  }),
);

batchesRouter.get(
  "/:id/output-1/estimate",
  asyncHandler(async (req, res) => {
    getBatchOrThrow(req.params.id);
    sendSuccess(res, estimateBatchOutputOneCost(listBatchProducts(req.params.id)));
  }),
);

batchesRouter.post(
  "/:id/instagram",
  asyncHandler(async (req, res) => {
    getBatchOrThrow(req.params.id);
    sendSuccess(res, await generateExplicitInstagramImages({ ...req.body, expectedBatchId: req.params.id }));
  }),
);

batchesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const batch = getBatchOrThrow(req.params.id);
    sendSuccess(res, { batch, products: listBatchProducts(req.params.id) });
  }),
);

batchesRouter.get(
  "/:id/products",
  asyncHandler(async (req, res) => {
    getBatchOrThrow(req.params.id);
    sendSuccess(res, listBatchProducts(req.params.id));
  }),
);

function getBatchOrThrow(batchId) {
  const batch = getBatchById(batchId);
  if (!batch) {
    throw new AppError("Batch not found.", 404);
  }

  return batch;
}

function requireBodyString(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) {
    throw new AppError(`Request body must include "${fieldName}".`, 400);
  }

  return text;
}
