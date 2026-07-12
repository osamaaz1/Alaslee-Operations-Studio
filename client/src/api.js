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
    throw new Error(body?.errors?.[0]?.message || body?.error?.message || "تعذر إتمام الطلب.");
  }

  return body?.success === true ? body.data : body;
}

export const get = (path) => api(path);
export const post = (path, body, json = true) =>
  api(path, {
    method: "POST",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify(body) : body,
  });
export const put = (path, body) =>
  api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const remove = (path) => api(path, { method: "DELETE" });

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
