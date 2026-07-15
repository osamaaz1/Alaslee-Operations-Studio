// Configures Express middleware, static files, and versioned API routes.

import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { normalizeProviderName } from "./domain/providers.js";
import "./db/database.js";
import { productsRouter } from "./routes/products.js";
import { batchesRouter } from "./routes/batches.js";
import { brandingRouter } from "./routes/branding.js";
import { instagramRouter } from "./routes/instagram.js";
import { promptsRouter } from "./routes/prompts.js";
import { dataWorkspaceRouter } from "./routes/dataWorkspace.js";
import { sallaRouter } from "./routes/salla.js";
import { crmAuthRouter } from "./routes/crmAuth.js";
import { crmCustomersRouter } from "./routes/crmCustomers.js";
import { crmSalesRouter } from "./routes/crmSales.js";
import { crmRfmRouter } from "./routes/crmRfm.js";
import { crmImportsRouter } from "./routes/crmImports.js";
import { daftraRouter } from "./routes/daftra.js";
import { accountVaultRouter } from "./routes/accountVault.js";
import { feedbackRouter } from "./routes/feedback.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { corsOptionsForRequest, requireWriteAccess, sameOriginWrites } from "./middleware/accessControl.js";
import { sendSuccess } from "./utils/apiResponse.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { openapiSpec } from "./openapi/openapiSpec.js";
import { getPriceLabelEditorStatus } from "./services/priceLabelEditService.js";
import { requireCrmCsrf, requireCrmSession, requireSuperuser } from "./middleware/crmAccess.js";
import { crmDatabaseHealth } from "./infra/crm/postgres.js";
import { feedbackStatus } from "./services/feedbackService.js";
import { livenessStatus, readinessStatus } from "./services/readinessService.js";

export function createApp() {
  const app = express();
  const clientDir = path.join(config.rootDir, "client", "dist");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", "data:", "blob:"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        },
      },
    }),
  );
  app.use(cors((req, callback) => callback(null, corsOptionsForRequest(req))));
  app.use(express.json({ limit: "1mb" }));
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
  }
  app.use("/uploads", express.static(config.uploadsDir));
  app.use(rateLimit);
  app.use(sameOriginWrites);
  app.use(requireWriteAccess);

  app.get("/api", (req, res) => {
    sendSuccess(res, {
      name: "Optical Store AI Product Image Generator",
      status: "running",
      provider: normalizeProviderName(config.aiProvider),
      endpoints: {
        health: "GET /health",
        dataSummary: "GET /v1/data/summary",
        sallaStatus: "GET /v1/salla/status",
        openapi: "GET /v1/openapi.json",
        upload: "POST /v1/products/upload",
        generate: "POST /v1/products/generate",
        output1Generate: "POST /v1/products/:id/output-1/generate",
        output1Mock: "POST /v1/products/:id/output-1/mock",
        output1Metadata: "GET /v1/products/:id/output-1",
        output2Metadata: "GET /v1/products/:id/output-2",
        batchImport: "POST /v1/batches/import-folder",
        batchGenerate: "POST /v1/batches/:id/generate",
        batchMockOutput1: "POST /v1/batches/:id/output-1/mock",
        brandingAssets: "GET|POST /v1/branding/assets",
        brandingSettings: "GET|PUT /v1/branding/settings",
        brandingPreview: "POST /v1/branding/preview",
        instagramUploads: "POST /v1/instagram/uploads",
        instagramGenerate: "POST /v1/instagram/generate",
        prompts: "GET|PUT /v1/prompts",
      },
    });
  });

  app.get("/health", asyncHandler(async (req, res) => {
    sendSuccess(res, {
      ok: true,
      provider: normalizeProviderName(config.aiProvider),
      aiProviders: {
        gemini: { configured: Boolean(config.gemini.apiKey) },
        gpt: { configured: Boolean(config.openai.apiKey) },
      },
      priceLabelEditor: getPriceLabelEditorStatus(),
      crm: await crmDatabaseHealth(),
      feedback: feedbackStatus(),
    });
  }));

  app.get("/health/live", (req, res) => sendSuccess(res, livenessStatus()));
  app.get("/health/ready", asyncHandler(async (req, res) => {
    const status = await readinessStatus();
    return sendSuccess(res, status, status.ready ? 200 : 503);
  }));

  app.get("/v1/openapi.json", (req, res) => {
    sendSuccess(res, openapiSpec);
  });

  app.use("/v1/products", productsRouter);
  app.use("/v1/auth", crmAuthRouter);
  app.use("/v1/crm/customers", requireCrmSession, requireCrmCsrf, crmCustomersRouter);
  app.use("/v1/crm/sales", requireCrmSession, requireCrmCsrf, crmSalesRouter);
  app.use("/v1/crm/rfm", requireCrmSession, requireCrmCsrf, crmRfmRouter);
  app.use("/v1/crm/imports", requireCrmSession, requireCrmCsrf, crmImportsRouter);
  app.use("/v1/daftra", requireCrmSession, requireCrmCsrf, daftraRouter);
  app.use("/v1/accounts", requireCrmSession, requireCrmCsrf, requireSuperuser, accountVaultRouter);
  app.use("/v1/feedback", feedbackRouter);
  app.use("/v1/data", dataWorkspaceRouter);
  app.use("/v1/salla", sallaRouter);
  app.use("/v1/batches", batchesRouter);
  app.use("/v1/branding", brandingRouter);
  app.use("/v1/instagram", instagramRouter);
  app.use("/v1/prompts", promptsRouter);
  app.get("/{*clientPath}", (req, res, next) => {
    const clientIndex = path.join(clientDir, "index.html");
    if (req.method !== "GET" || isServerPath(req.path) || !fs.existsSync(clientIndex)) return next();
    if (!isClientPath(req.path) && !req.accepts("html")) return next();
    return res.sendFile(clientIndex);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function isServerPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/v1/")
    || pathname === "/uploads" || pathname.startsWith("/uploads/")
    || pathname === "/health" || pathname.startsWith("/health/");
}

function isClientPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return new Set(["/", "/products", "/campaigns", "/crm", "/accounts", "/settings"]).has(normalized)
    || normalized.startsWith("/crm/");
}
