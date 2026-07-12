// Reports Salla integration readiness and validates live access when a token is available.

import { config } from "../config.js";

const connectivityTimeoutMs = 4_000;

export async function getSallaStatus() {
  const checks = [
    { key: "clientId", label: "Client ID", ready: Boolean(config.salla.clientId) },
    { key: "redirectUri", label: "Redirect URI", ready: Boolean(config.salla.redirectUri) },
    { key: "apiBaseUrl", label: "API base URL", ready: Boolean(config.salla.apiBaseUrl) },
    { key: "authUrl", label: "Auth URL", ready: Boolean(config.salla.authUrl) },
    { key: "tokenUrl", label: "Token URL", ready: Boolean(config.salla.tokenUrl) },
    { key: "webhookSecurity", label: "Webhook secret/token", ready: Boolean(config.salla.webhookSecret || config.salla.webhookToken) },
    { key: "accessToken", label: "Access token", ready: Boolean(config.salla.accessToken) },
  ];
  const requiredConfigKeys = new Set(["clientId", "redirectUri", "apiBaseUrl", "authUrl", "tokenUrl", "webhookSecurity"]);
  const missing = checks.filter((item) => requiredConfigKeys.has(item.key) && !item.ready).map((item) => item.key);
  const configured = missing.length === 0;
  const tokenReady = Boolean(config.salla.accessToken);
  const connectivity = configured && tokenReady ? await checkSallaConnection() : null;
  const connected = Boolean(connectivity?.connected);
  const status = sallaStatus({ configured, tokenReady, connected, connectivity });

  return {
    provider: "salla",
    label: "Salla",
    configured,
    connected,
    status,
    message: sallaMessage(status),
    missing,
    checks,
    apiBaseUrl: config.salla.apiBaseUrl,
    connectivity,
  };
}

async function checkSallaConnection() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), connectivityTimeoutMs);

  try {
    const response = await fetch(`${trimSlash(config.salla.apiBaseUrl)}/store/info`, {
      headers: { Authorization: `Bearer ${config.salla.accessToken}` },
      signal: controller.signal,
    });
    return {
      connected: response.ok,
      statusCode: response.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connected: false,
      error: error?.name === "AbortError" ? "timeout" : "request_failed",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sallaStatus({ configured, tokenReady, connected, connectivity }) {
  if (!configured) return "missing_config";
  if (!tokenReady) return "not_connected";
  if (connected) return "connected";
  if (connectivity?.statusCode === 401 || connectivity?.statusCode === 403) return "auth_failed";
  return "connection_failed";
}

function sallaMessage(status) {
  if (status === "connected") return "Salla connected";
  if (status === "not_connected") return "Salla access token missing";
  if (status === "auth_failed") return "Salla token rejected";
  if (status === "connection_failed") return "Salla connection failed";
  return "Salla config missing";
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
