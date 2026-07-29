// Exposes catalog, preview, rendering, and superuser layout controls for native overlays.

import { Router } from "express";
import { requireCrmCsrf, requireCrmSession, requireSuperuser } from "../middleware/crmAccess.js";
import { getBrandOverlayCatalog } from "../domain/brandOverlayCatalog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getAlasleeOverlayAsset, getBrandOverlayAsset } from "../services/brandOverlayAssetService.js";
import {
  createBrandOverlayPreview,
  renderBrandOverlays,
} from "../services/brandOverlayGenerationService.js";
import {
  getBrandOverlaySettingsDocument,
  saveBrandOverlaySettings,
} from "../services/brandOverlaySettingsService.js";

export const brandOverlayRouter = Router();

brandOverlayRouter.get("/catalog", (req, res) => sendSuccess(res, getBrandOverlayCatalog()));

brandOverlayRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getBrandOverlaySettingsDocument(req.query.brandId));
  }),
);

brandOverlayRouter.get(
  "/assets/brands/:brandId",
  asyncHandler(async (req, res) => {
    const asset = await getBrandOverlayAsset(req.params.brandId, req.query.tone || "original");
    sendPng(res, asset.buffer, "public, max-age=86400");
  }),
);

brandOverlayRouter.get(
  "/assets/alaslee/:variantId",
  asyncHandler(async (req, res) => {
    const asset = await getAlasleeOverlayAsset(req.params.variantId);
    sendPng(res, asset.buffer, "public, max-age=86400");
  }),
);

brandOverlayRouter.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const preview = await createBrandOverlayPreview(req.body);
    setPreviewHeaders(res, preview);
    res.send(preview.buffer);
  }),
);

brandOverlayRouter.post(
  "/admin/preview",
  requireCrmSession,
  requireCrmCsrf,
  requireSuperuser,
  asyncHandler(async (req, res) => {
    const preview = await createBrandOverlayPreview(req.body, { layoutOverride: req.body?.layout });
    setPreviewHeaders(res, preview);
    res.send(preview.buffer);
  }),
);

brandOverlayRouter.put(
  "/settings",
  requireCrmSession,
  requireCrmCsrf,
  requireSuperuser,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await saveBrandOverlaySettings(req.body));
  }),
);

brandOverlayRouter.post(
  "/render",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await renderBrandOverlays(req.body, req), 201);
  }),
);

function sendPng(res, buffer, cacheControl) {
  res.type("png");
  res.set("Cache-Control", cacheControl);
  res.send(buffer);
}

function setPreviewHeaders(res, preview) {
  res.type("png");
  res.set("Cache-Control", "no-store");
  res.set("X-Preview-Width", String(preview.width));
  res.set("X-Preview-Height", String(preview.height));
  res.set("X-Resolved-Brand-Tone", preview.brandTone);
  res.set("X-Resolved-Supporting-Tone", preview.supportingTone);
}
