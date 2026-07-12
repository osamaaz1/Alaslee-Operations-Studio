// Protects write endpoints with an optional local API key.

import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireWriteAccess(req, res, next) {
  if (!writeMethods.has(req.method)) return next();
  if (usesCrmSession(req.path)) return next();
  if (!config.security.adminApiKey) return next();

  const providedKey = req.get("x-api-key");
  if (providedKey === config.security.adminApiKey) return next();

  return next(new AppError("Valid API key is required.", 401));
}

function usesCrmSession(pathname) {
  return pathname.startsWith("/v1/auth/") || pathname.startsWith("/v1/crm/") || pathname.startsWith("/v1/daftra/") || pathname === "/v1/feedback" || pathname.startsWith("/v1/feedback/");
}

export function sameOriginWrites(req, res, next) {
  if (!writeMethods.has(req.method)) return next();

  const origin = req.get("origin");
  if (!origin) return next();

  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  const trustedLocalClient = config.localDevClientOrigin;
  if (origin === expectedOrigin || (trustedLocalClient && origin === trustedLocalClient)) return next();

  return next(new AppError("Cross-origin write request rejected.", 403));
}
