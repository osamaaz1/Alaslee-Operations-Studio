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

  if (isTrustedWriteOrigin(origin, req)) return next();

  return next(new AppError("Cross-origin write request rejected.", 403));
}

function isTrustedWriteOrigin(origin, req) {
  const originUrl = parseUrl(origin);
  if (!originUrl) return false;

  // HTTPS is commonly terminated by a reverse proxy before reaching Express
  // over HTTP. Matching the host avoids rejecting a legitimate login solely
  // because the internal and public protocols differ.
  const requestHost = normalizeHost(req.get("host"));
  if (requestHost && normalizeHost(originUrl.host) === requestHost) return true;

  // The Vite development proxy may forward the API request with localhost as
  // its Host even when the browser opened the studio through the server's LAN
  // address. Permit private-network browser origins so every device on the
  // local network can use the authenticated CRM UI without per-device setup.
  if (isPrivateNetworkHost(originUrl.hostname)) return true;

  return [config.publicBaseUrl, config.localDevClientOrigin]
    .map(parseUrl)
    .some((trustedUrl) => trustedUrl?.origin === originUrl.origin);
}

function parseUrl(value) {
  try {
    return value ? new URL(value) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
}

function isPrivateNetworkHost(value) {
  const hostname = normalizeHost(value).replace(/^\[/, "").replace(/\]$/, "");
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return true;

  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return /^(fc|fd|fe8|fe9|fea|feb)/i.test(hostname);
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}
