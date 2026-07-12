// Exposes explainable RFM rules and superuser updates.

import { Router } from "express";
import { rfmRulesSchema } from "../../shared/crm/rfmSchemas.js";
import { requireSuperuser } from "../middleware/crmAccess.js";
import { validateBody } from "../middleware/validate.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getRfmRules, updateRfmRules } from "../services/crmRfmService.js";
import { writeAudit } from "../services/crmAuditService.js";

export const crmRfmRouter = Router();

crmRfmRouter.get("/rules", asyncHandler(async (req, res) => {
  sendSuccess(res, await withCrmTransaction(req.crmActor, getRfmRules));
}));

crmRfmRouter.put("/rules", requireSuperuser, validateBody(rfmRulesSchema), asyncHandler(async (req, res) => {
  const data = await withCrmTransaction(req.crmActor, async (client) => {
    const result = await updateRfmRules(client, req.validatedBody, req.crmActor.id);
    await writeAudit(client, req.crmActor, "rfm.rules.update", "rfm_rules", result.id, {});
    return result;
  });
  sendSuccess(res, data);
}));
