// Exposes superuser-only historical import and review status endpoints.

import { Router } from "express";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { validateBody } from "../middleware/validate.js";
import { mergeCandidateDecisionSchema } from "../../shared/crm/importSchemas.js";
import {
  importCrmHistory, listImportBatches, listMergeCandidates, resolveMergeCandidate,
  importCustomerFile,
} from "../services/crmHistoryImportService.js";
import { crmImportUpload } from "../middleware/upload.js";

export const crmImportsRouter = Router();

crmImportsRouter.use(requireSuperuser);

crmImportsRouter.post("/customers/file", crmImportUpload, asyncHandler(async (req, res) => {
  const dryRun = String(req.body?.dryRun || "false").toLowerCase() === "true";
  sendSuccess(res, await importCustomerFile(req.file, req.crmActor, req.ip, { dryRun }), dryRun ? 200 : 201);
}));

crmImportsRouter.get("/", asyncHandler(async (req, res) => {
  sendSuccess(res, await listImportBatches(req.crmActor));
}));

crmImportsRouter.post("/history", asyncHandler(async (req, res) => {
  sendSuccess(res, await importCrmHistory(req.crmActor, req.ip), 201);
}));

crmImportsRouter.get("/candidates", asyncHandler(async (req, res) => {
  sendSuccess(res, await listMergeCandidates(req.crmActor, String(req.query.status || "pending")));
}));

crmImportsRouter.post("/candidates/:id/decision", validateBody(mergeCandidateDecisionSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await resolveMergeCandidate(req.params.id, req.validatedBody, req.crmActor, req.ip));
}));
