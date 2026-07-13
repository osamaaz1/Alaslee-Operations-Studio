// Converts missing routes and thrown errors into standardized API envelopes.

import { isAppError } from "../utils/errors.js";
import { errorEnvelope } from "../utils/apiResponse.js";

export function notFoundHandler(req, res) {
  res.status(404).json(errorEnvelope("Route not found."));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (!isAppError(error)) {
    const diagnostic = error?.stack || error?.message || String(error);
    console.error(`[api-error] ${req.method} ${req.originalUrl || req.url}\n${diagnostic}`);
  }

  const statusCode = isAppError(error) ? error.statusCode : 500;
  const message = isAppError(error) ? error.message : "Internal server error.";
  const details = resolveDetails(error);

  res.status(statusCode).json(errorEnvelope(message, details));
}

function resolveDetails(error) {
  if (isAppError(error)) return error.details;
  if (process.env.NODE_ENV !== "production" && !isAppError(error)) {
    return error.message;
  }

  return undefined;
}
