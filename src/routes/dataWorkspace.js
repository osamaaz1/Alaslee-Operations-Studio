// Exposes the unified OriginalEye data workspace summary.

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getDataWorkspaceSummary, getProductMergeRows, getWidgetCatalog, renderDataWidget } from "../services/dataWorkspaceService.js";
import {
  createDashboardProfile,
  getDashboardProfile,
  listDashboardProfiles,
  updateDashboardProfile,
} from "../services/dataDashboardProfileService.js";
import { mergeProductRows } from "../services/dataProductMergeService.js";

export const dataWorkspaceRouter = Router();

dataWorkspaceRouter.get(
  "/widget-catalog",
  asyncHandler(async (req, res) => {
    sendSuccess(res, getWidgetCatalog());
  }),
);

dataWorkspaceRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getDataWorkspaceSummary({ query: req.query?.q }));
  }),
);

dataWorkspaceRouter.post(
  "/widgets/preview",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await renderDataWidget(req.body));
  }),
);

dataWorkspaceRouter.get(
  "/product-merge",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getProductMergeRows({ query: req.query?.q }));
  }),
);

dataWorkspaceRouter.post(
  "/product-merge",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await mergeProductRows(req.body));
  }),
);

dataWorkspaceRouter.get(
  "/dashboard-profiles",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listDashboardProfiles());
  }),
);

dataWorkspaceRouter.post(
  "/dashboard-profiles",
  asyncHandler(async (req, res) => {
    sendSuccess(res, createDashboardProfile(req.body), 201);
  }),
);

dataWorkspaceRouter.get(
  "/dashboard-profiles/:id",
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getDashboardProfile(req.params.id, { query: req.query?.q }));
  }),
);

dataWorkspaceRouter.put(
  "/dashboard-profiles/:id",
  asyncHandler(async (req, res) => {
    sendSuccess(res, updateDashboardProfile(req.params.id, req.body));
  }),
);
