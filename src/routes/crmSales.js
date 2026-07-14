// Exposes protected multi-line manual sales and superuser corrections.

import { Router } from "express";
import {
  saleCorrectionSchema, saleCreateSchema, saleDeliverySchema, salePaymentSchema, saleRefundSchema,
} from "../../shared/crm/saleSchemas.js";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  addSalePayment, correctSale, createSale, getSale, listSales, listSalesAgenda, refundSalePayment, updateSaleDelivery,
} from "../services/crmSaleService.js";

export const crmSalesRouter = Router();

crmSalesRouter.get("/", asyncHandler(async (req, res) => {
  sendSuccess(res, await listSales(req.crmActor));
}));

crmSalesRouter.post("/", validateBody(saleCreateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await createSale(req.validatedBody, req.crmActor, req.ip), 201);
}));

crmSalesRouter.get("/agenda", asyncHandler(async (req, res) => {
  sendSuccess(res, await listSalesAgenda(req.crmActor));
}));

crmSalesRouter.get("/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, await getSale(req.params.id, req.crmActor));
}));

crmSalesRouter.post("/:id/payments", validateBody(salePaymentSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await addSalePayment(req.params.id, req.validatedBody, req.crmActor, req.ip), 201);
}));

crmSalesRouter.post("/:id/refunds", requireSuperuser, validateBody(saleRefundSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await refundSalePayment(req.params.id, req.validatedBody, req.crmActor, req.ip), 201);
}));

crmSalesRouter.put("/:id/delivery", validateBody(saleDeliverySchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await updateSaleDelivery(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));

crmSalesRouter.post("/:id/corrections", requireSuperuser, validateBody(saleCorrectionSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await correctSale(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));
