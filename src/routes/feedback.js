// Exposes global feedback readiness and a guarded Supabase-only report submission route.

import { Router } from "express";
import { feedbackReportSchema } from "../../shared/feedback/feedbackSchemas.js";
import { feedbackRateLimit } from "../middleware/feedbackRateLimit.js";
import { feedbackImageUpload, feedbackMulterErrorHandler } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { feedbackStatus, submitFeedback } from "../services/feedbackService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const feedbackRouter = Router();

feedbackRouter.get("/status", (req, res) => {
  sendSuccess(res, feedbackStatus());
});

feedbackRouter.post(
  "/",
  feedbackRateLimit,
  feedbackImageUpload,
  feedbackMulterErrorHandler,
  validateBody(feedbackReportSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await submitFeedback(req.validatedBody, req.file), 201);
  }),
);
