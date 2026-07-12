// Exposes the audited, superuser-only store-account credential vault.

import { Router } from "express";
import { accountVaultCreateSchema, accountVaultUpdateSchema } from "../../shared/crm/accountVaultSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { validateBody } from "../middleware/validate.js";
import {
  createVaultEntry, deleteVaultEntry, getVaultEntry, listVaultEntries, revealVaultSecret, updateVaultEntry,
} from "../services/accountVaultService.js";

export const accountVaultRouter = Router();

accountVaultRouter.get("/", asyncHandler(async (req, res) => {
  sendSuccess(res, await listVaultEntries(req.crmActor, req.query.q));
}));

accountVaultRouter.post("/", validateBody(accountVaultCreateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await createVaultEntry(req.validatedBody, req.crmActor, req.ip), 201);
}));

accountVaultRouter.get("/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, await getVaultEntry(req.params.id, req.crmActor, req.ip));
}));

accountVaultRouter.put("/:id", validateBody(accountVaultUpdateSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await updateVaultEntry(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));

accountVaultRouter.post("/:id/reveal", asyncHandler(async (req, res) => {
  sendSuccess(res, await revealVaultSecret(req.params.id, req.crmActor, req.ip));
}));

accountVaultRouter.delete("/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, await deleteVaultEntry(req.params.id, req.crmActor, req.ip));
}));
