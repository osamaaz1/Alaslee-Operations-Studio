// Exposes explicit Instagram generation endpoints.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { instagramSourceUpload, multerErrorHandler } from "../middleware/upload.js";
import { generateExplicitInstagramImages } from "../services/explicitInstagramGenerationService.js";
import { createDirectInstagramUpload } from "../services/instagramUploadService.js";
import { estimateOutputTwoCost } from "../services/outputCostEstimateService.js";

export const instagramRouter = Router();

instagramRouter.post(
  "/uploads",
  instagramSourceUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await createDirectInstagramUpload(req.files, { req }), 201);
  }),
);

instagramRouter.post(
  "/estimate",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await estimateOutputTwoCost(req.body));
  }),
);

instagramRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await generateExplicitInstagramImages(req.body));
  }),
);
