import path from "node:path";
import { config } from "../config.js";

export function toUploadUrl(filePath) {
  const relative = path.relative(config.uploadsDir, filePath).split(path.sep).join("/");
  return `/uploads/${relative}`;
}

export function absoluteUrl(req, relativeUrl) {
  if (config.publicBaseUrl) {
    if (req && shouldUseRequestBase(config.publicBaseUrl, req.get("host"))) {
      return `${req.protocol}://${req.get("host")}${relativeUrl}`;
    }

    return `${config.publicBaseUrl.replace(/\/$/, "")}${relativeUrl}`;
  }

  return `${req.protocol}://${req.get("host")}${relativeUrl}`;
}

function shouldUseRequestBase(publicBaseUrl, requestHost) {
  try {
    const configured = new URL(publicBaseUrl);
    const configuredHost = normalizeHost(configured.hostname);
    const currentHost = normalizeHost(String(requestHost || "").split(":")[0]);
    return isLoopbackHost(configuredHost) && isLoopbackHost(currentHost) && configured.host !== requestHost;
  } catch {
    return false;
  }
}

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
