// Exposes protected multi-line manual sales and superuser corrections.

import { Router } from "express";
import { saleCorrectionSchema, saleCreateSchema } from "../../shared/crm/saleSchemas.js";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { correctSale, createSale, getSale, listSales } from "../services/crmSaleService.js";

export const crmSalesRouter = Router();

crmSalesRouter.get("/", asyncHandler(async (req, res) => {
  sendSuccess(res, await listSales(req.crmActor));
}));

crmSalesRouter.post("/", validateBody(saleCreateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await createSale(req.validatedBody, req.crmActor, req.ip), 201);
}));

crmSalesRouter.get("/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, await getSale(req.params.id, req.crmActor));
}));

crmSalesRouter.post("/:id/corrections", requireSuperuser, validateBody(saleCorrectionSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await correctSale(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));
