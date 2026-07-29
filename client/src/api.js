const apiBase = "/v1";

export async function api(path, options = {}) {
  const request = withSecurityHeaders(options);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // /health is intentionally exposed outside the versioned API. All workspace
  // and CRM routes live below /v1, including callers that pass a leading slash.
  const url = normalizedPath === "/health" ? normalizedPath : `${apiBase}${normalizedPath}`;
  const response = await fetch(url, request);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok || body?.success === false) {
    const payload = body?.errors?.[0] || body?.error || {};
    const error = new Error(payload.message || "تعذر إتمام الطلب.");
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }

  return body?.success === true ? body.data : body;
}

export const get = (path, options = {}) => api(path, options);
export const post = (path, body, json = true) =>
  api(path, {
    method: "POST",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify(body) : body,
  });
export const put = (path, body) =>
  api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const remove = (path) => api(path, { method: "DELETE" });
export async function postBlob(path, body) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${apiBase}${normalizedPath}`, withSecurityHeaders({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    const errorPayload = payload?.errors?.[0] || payload?.error || {};
    const error = new Error(errorPayload.message || "تعذر إنشاء المعاينة.");
    error.status = response.status;
    error.details = errorPayload.details;
    throw error;
  }
  return {
    blob: await response.blob(),
    width: Number(response.headers.get("x-preview-width")) || null,
    height: Number(response.headers.get("x-preview-height")) || null,
    brandTone: response.headers.get("x-resolved-brand-tone"),
    supportingTone: response.headers.get("x-resolved-supporting-tone"),
  };
}

function withSecurityHeaders(options) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = cookieValue("alaslee_crm_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  return { credentials: "same-origin", ...options, headers };
}

function cookieValue(name) {
  const part = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
