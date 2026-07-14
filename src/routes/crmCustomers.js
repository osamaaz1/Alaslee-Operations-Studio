// Exposes protected customer, prescription, source, and audit endpoints.

import { Router } from "express";
import { customerCreateSchema } from "../../shared/crm/customerSchemas.js";
import { prescriptionSchema } from "../../shared/crm/prescriptionSchemas.js";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  addPrescription, createCustomer, customerAudit, getCustomer, listCustomers,
  listCustomerSources, setCustomerDeleted, updateCustomer, exportCustomers,
} from "../services/crmCustomerService.js";

export const crmCustomersRouter = Router();

crmCustomersRouter.get("/sources", asyncHandler(async (req, res) => {
  sendSuccess(res, await listCustomerSources(req.crmActor));
}));

crmCustomersRouter.get("/", asyncHandler(async (req, res) => {
  sendSuccess(res, await listCustomers(req.crmActor, req.query.q, { limit: req.query.limit }));
}));

crmCustomersRouter.get("/export", requireSuperuser, asyncHandler(async (req, res) => {
  const format = String(req.query.format || "csv").toLowerCase();
  if (!["csv", "xlsx"].includes(format)) return res.status(400).json({ success: false, error: { message: "صيغة التصدير غير صالحة." } });
  const result = await exportCustomers(req.crmActor, req.query.q, format, req.ip);
  res.set({
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename=customers-${new Date().toISOString().slice(0, 10)}.${result.extension}`,
    "Content-Length": result.buffer.length,
  });
  return res.send(result.buffer);
}));

crmCustomersRouter.post("/", validateBody(customerCreateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await createCustomer(req.validatedBody, req.crmActor, req.ip), 201);
}));

crmCustomersRouter.get("/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, await getCustomer(req.params.id, req.crmActor, req.ip));
}));

crmCustomersRouter.put("/:id", requireSuperuser, validateBody(customerCreateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await updateCustomer(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));

crmCustomersRouter.delete("/:id", requireSuperuser, asyncHandler(async (req, res) => {
  sendSuccess(res, await setCustomerDeleted(req.params.id, true, req.crmActor, req.ip));
}));

crmCustomersRouter.post("/:id/restore", requireSuperuser, asyncHandler(async (req, res) => {
  sendSuccess(res, await setCustomerDeleted(req.params.id, false, req.crmActor, req.ip));
}));

crmCustomersRouter.post("/:id/prescriptions", validateBody(prescriptionSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await addPrescription(req.params.id, req.validatedBody, req.crmActor, req.ip), 201);
}));

crmCustomersRouter.get("/:id/audit", requireSuperuser, asyncHandler(async (req, res) => {
  sendSuccess(res, await customerAudit(req.params.id, req.crmActor));
}));
