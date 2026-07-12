import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { getAllPrompts, updatePrompts, resetPrompts } from "../services/promptService.js";

export const promptsRouter = Router();

promptsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getAllPrompts());
  }),
);

promptsRouter.post(
  "/reset",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await resetPrompts());
  }),
);

promptsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const updates = req.body?.prompts || req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError("Request body must include a non-empty array of prompts.", 400);
    }
    sendSuccess(res, await updatePrompts(updates));
  }),
);
