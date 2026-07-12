// Exposes Salla integration readiness for the unified workspace.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getSallaStatus } from "../services/sallaStatusService.js";

export const sallaRouter = Router();

sallaRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getSallaStatus());
  }),
);
