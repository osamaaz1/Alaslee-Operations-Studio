// Exposes branding asset upload and access-status endpoints.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { brandingPreviewUpload, brandingUpload, multerErrorHandler } from "../middleware/upload.js";
import { getBrandingAssetStatus, saveBrandingAssets } from "../services/brandingAssetService.js";
import {
  createBrandingPreview,
  saveBrandingPreviewOutput,
} from "../services/brandingPreviewService.js";
import {
  getCompositionSettingsDocument,
  saveCompositionSettings,
} from "../services/compositionSettingsService.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const brandingRouter = Router();

brandingRouter.get(
  "/assets",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getBrandingAssetStatus(req));
  }),
);

brandingRouter.post(
  "/assets",
  brandingUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await saveBrandingAssets(req.files, req));
  }),
);

brandingRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getCompositionSettingsDocument());
  }),
);

brandingRouter.put(
  "/settings",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await saveCompositionSettings(req.body));
  }),
);

brandingRouter.post(
  "/preview",
  brandingPreviewUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    const preview = await createBrandingPreview(req.file, req.body);
    res.type("png");
    res.set("Cache-Control", "no-store");
    res.set("X-Preview-Width", String(preview.width));
    res.set("X-Preview-Height", String(preview.height));
    res.send(preview.buffer);
  }),
);

brandingRouter.post(
  "/preview/output",
  brandingPreviewUpload,
  multerErrorHandler,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await saveBrandingPreviewOutput(req.body?.productId, req.file, req.body, req), 201);
  }),
);
