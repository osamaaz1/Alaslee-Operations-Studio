// Provides the browser-side API service layer for the UI.

const apiBase = "/v1";

export function loadHealth() {
  return requestJson("/health");
}

export function loadDataWorkspace(query = "") {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson(`${apiBase}/data/summary${params}`);
}

export function loadDataWidgetCatalog() {
  return requestJson(`${apiBase}/data/widget-catalog`);
}

export function previewDataWidget(widget) {
  return requestJson(`${apiBase}/data/widgets/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  });
}

export function loadDataProductMergeRows(query = "") {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson(`${apiBase}/data/product-merge${params}`);
}

export function mergeDataProductRows(payload) {
  return requestJson(`${apiBase}/data/product-merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function loadDataDashboardProfiles() {
  return requestJson(`${apiBase}/data/dashboard-profiles`);
}

export function loadDataDashboardProfile(profileId = "default", query = "") {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson(`${apiBase}/data/dashboard-profiles/${encodeURIComponent(profileId)}${params}`);
}

export function createDataDashboardProfile(payload) {
  return requestJson(`${apiBase}/data/dashboard-profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function saveDataDashboardProfile(profileId, payload) {
  return requestJson(`${apiBase}/data/dashboard-profiles/${encodeURIComponent(profileId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function loadSallaStatus() {
  return requestJson(`${apiBase}/salla/status`);
}

export function loadBrandingAssets() {
  return requestJson(`${apiBase}/branding/assets`);
}

export function uploadBrandingAssets(formData) {
  return requestJson(`${apiBase}/branding/assets`, {
    method: "POST",
    body: formData,
  });
}

export function loadCompositionSettings() {
  return requestJson(`${apiBase}/branding/settings`);
}

export function saveCompositionSettings(payload) {
  return requestJson(`${apiBase}/branding/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createBrandingPreview(formData, options = {}) {
  const response = await fetch(`${apiBase}/branding/preview`, {
    method: "POST",
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : null;
    throw new Error(errorMessage(body, response.status));
  }

  return response.blob();
}

export function saveBrandingPreviewOutput(formData) {
  return requestJson(`${apiBase}/branding/preview/output`, {
    method: "POST",
    body: formData,
  });
}

export function uploadProduct(formData) {
  return requestJson(`${apiBase}/products/upload`, {
    method: "POST",
    body: formData,
  });
}

export function generateProduct(payload) {
  return requestJson(`${apiBase}/products/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function estimateProductOutputOne(productId) {
  return requestJson(`${apiBase}/products/${encodeURIComponent(productId)}/output-1/estimate`);
}

export function loadProduct(productId) {
  return requestJson(`${apiBase}/products/${encodeURIComponent(productId)}`);
}

export function importBatchFolder(payload) {
  return requestJson(`${apiBase}/batches/import-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function generateBatch(payload) {
  return requestJson(`${apiBase}/batches/${encodeURIComponent(payload.batchId)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: payload.force }),
  });
}

export function estimateBatchOutputOne(batchId) {
  return requestJson(`${apiBase}/batches/${encodeURIComponent(batchId)}/output-1/estimate`);
}

export function loadBatch(batchId) {
  return requestJson(`${apiBase}/batches/${encodeURIComponent(batchId)}`);
}

export function loadPrompts() {
  return requestJson(`${apiBase}/prompts`);
}

export function resetPrompts() {
  return requestJson(`${apiBase}/prompts/reset`, { method: "POST" });
}

export function savePrompts(prompts) {
  return requestJson(`${apiBase}/prompts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompts }),
  });
}

export function generateInstagram(payload) {
  return requestJson(`${apiBase}/instagram/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function uploadInstagramSources(formData) {
  return requestJson(`${apiBase}/instagram/uploads`, {
    method: "POST",
    body: formData,
  });
}

export function estimateInstagram(payload) {
  return requestJson(`${apiBase}/instagram/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function generateBatchInstagram(batchId, payload) {
  return requestJson(`${apiBase}/batches/${encodeURIComponent(batchId)}/instagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok || body?.success === false) {
    throw new Error(errorMessage(body, response.status));
  }

  return body?.success === true ? body.data : body;
}

function errorMessage(body, status) {
  return body?.errors?.[0]?.message || body?.error?.message || `Request failed with status ${status}`;
}
