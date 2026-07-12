// Exposes product upload, retrieval, and generation endpoints.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mockOutputUpload, productUpload, multerErrorHandler } from "../middleware/upload.js";
import { createProductFromUpload, getProductById, getProductGallery } from "../services/productService.js";
import { generateProductGallery } from "../services/generationService.js";
import { generateExplicitInstagramImages } from "../services/explicitInstagramGenerationService.js";
import { createMockOutputOne } from "../services/freeTestOutputService.js";
import { estimateProductOutputOneCost } from "../services/outputCostEstimateService.js";
import { AppError } from "../utils/errors.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const productsRouter = Router();

productsRouter.post(
  "/upload",
  productUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    const product = await createProductFromUpload(req.files);
    sendSuccess(res, product, 201);
  }),
);

productsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const productId = req.body?.productId;
    if (!productId) {
      throw new AppError('Request body must include "productId".', 400);
    }

    const product = await generateProductGallery(productId, {
      force: req.body?.force === true,
      provider: req.body?.provider,
      req,
    });

    sendSuccess(res, product);
  }),
);

productsRouter.post(
  "/:id/output-1/generate",
  asyncHandler(async (req, res) => {
    const product = await generateProductGallery(req.params.id, {
      force: req.body?.force === true,
      provider: req.body?.provider,
      req,
    });

    sendSuccess(res, product);
  }),
);

productsRouter.get(
  "/:id/output-1/estimate",
  asyncHandler(async (req, res) => {
    sendSuccess(res, estimateProductOutputOneCost(req.params.id));
  }),
);

productsRouter.post(
  "/:id/output-1/mock",
  mockOutputUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    const product = await createMockOutputOne(req.params.id, req.files, {
      force: req.body?.force === "true" || req.body?.force === true,
      req,
    });

    sendSuccess(res, product);
  }),
);

productsRouter.get(
  "/:id/output-1",
  asyncHandler(async (req, res) => {
    sendSuccess(res, getProductById(req.params.id, req).generatedImages);
  }),
);

productsRouter.get(
  "/:id/output-2",
  asyncHandler(async (req, res) => {
    sendSuccess(res, getProductById(req.params.id, req).instagramImages);
  }),
);

productsRouter.post(
  "/:id/instagram",
  asyncHandler(async (req, res) => {
    const products = req.body?.products || {
      [req.params.id]: {
        price: req.body?.price,
        sku: req.body?.sku,
      },
    };
    const payload = {
      ...req.body,
      items: (req.body?.items || []).map((item) => ({ ...item, productId: req.params.id })),
      products,
    };
    sendSuccess(res, await generateExplicitInstagramImages(payload));
  }),
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    sendSuccess(res, getProductById(req.params.id, req));
  }),
);

productsRouter.get(
  "/:id/gallery",
  asyncHandler(async (req, res) => {
    sendSuccess(res, getProductGallery(req.params.id, req));
  }),
);
