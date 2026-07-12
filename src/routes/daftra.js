// Exposes cached Daftra products, sync status, and privileged manual refresh.

import { Router } from "express";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { listDaftraProducts } from "../services/daftraCatalogService.js";
import { daftraSyncStatus, syncDaftra } from "../services/daftraSyncService.js";

export const daftraRouter = Router();

daftraRouter.get("/products", asyncHandler(async (req, res) => {
  const availableOnly = ["1", "true", "yes"].includes(String(req.query.availableOnly || "").toLowerCase());
  sendSuccess(res, await listDaftraProducts(req.crmActor, req.query.q, { availableOnly }));
}));

daftraRouter.get("/sync/status", asyncHandler(async (req, res) => {
  sendSuccess(res, await daftraSyncStatus());
}));

daftraRouter.post("/sync", requireSuperuser, asyncHandler(async (req, res) => {
  sendSuccess(res, await syncDaftra(), 202);
}));
