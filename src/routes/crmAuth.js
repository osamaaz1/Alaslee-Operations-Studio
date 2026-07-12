// Exposes local PIN login, session inspection, and logout for the CRM UI.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { clearCrmSessionCookie, requireCrmCsrf, requireCrmSession, setCrmSessionCookie } from "../middleware/crmAccess.js";
import { createCrmSession, destroyCrmSession } from "../services/crmSessionService.js";
import { clearCrmPinAttempts, crmPinRateLimit } from "../middleware/crmPinLimit.js";
import { config } from "../config.js";
import { crmConfigured } from "../infra/crm/postgres.js";

export const crmAuthRouter = Router();

crmAuthRouter.get("/status", (req, res) => {
  sendSuccess(res, {
    configured: crmConfigured() && Boolean(config.crm.encryptionKey && config.crm.staffPin && config.crm.superuserPin),
    databaseConfigured: crmConfigured(),
  });
});

crmAuthRouter.post("/pin", crmPinRateLimit, asyncHandler(async (req, res) => {
  const session = await createCrmSession(req.body?.pin);
  clearCrmPinAttempts(req);
  setCrmSessionCookie(res, session.token, session.csrfToken, session.expiresAt);
  sendSuccess(res, publicSession(session));
}));

crmAuthRouter.get("/session", requireCrmSession, (req, res) => {
  sendSuccess(res, { role: req.crmActor.role, expiresAt: req.crmActor.expiresAt });
});

crmAuthRouter.post("/logout", requireCrmSession, requireCrmCsrf, asyncHandler(async (req, res) => {
  await destroyCrmSession(req.crmSessionToken);
  clearCrmSessionCookie(res);
  sendSuccess(res, { loggedOut: true });
}));

function publicSession(session) {
  return { role: session.role, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
}
