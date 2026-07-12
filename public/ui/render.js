// Renders product, batch, gallery, and status state into the console.

import { displayNames } from "./displayNames.js";
import { collectRenderableImages } from "./galleryImages.js";
import { TRY_FREE_MODE } from "./generationMode.js";
import { updateInstagramButton } from "./instagramPlanner.js";

export function renderHealth(dom, health) {
  const priceLabel = health.priceLabelEditor?.configured ? "price labels ready" : "price labels need OpenAI";
  dom.providerPill.textContent = `API online - Default ${providerLabel(health.provider)} - ${priceLabel}`;
}

export function renderHealthError(dom) {
  dom.providerPill.textContent = "API unavailable";
}

export function renderBrandingStatus(dom, branding) {
  const assets = branding?.assets || {};
  const referenceReady = branding?.priceLabelReferenceReady === true;
  const editorReady = branding?.priceLabelEditor?.configured === true;
  dom.brandReadinessMessage.textContent =
    branding?.ready && branding?.priceLabelReady
      ? "Brand assets, price-label reference, and price-label editor are ready."
      : brandingMessage(branding?.ready, referenceReady, editorReady);

  for (const name of ["background", "logo", "footer", "priceLabelReference"]) {
    renderAsset(dom, name, assets[name]);
  }
}

function brandingMessage(brandReady, referenceReady, editorReady) {
  if (!brandReady) return "Complete background, logo, and footer assets before Instagram generation.";
  if (!referenceReady) return "Add the price-label reference image before final Instagram generation.";
  if (!editorReady) return "Set OPENAI_API_KEY before final price-label insertion.";
  return "Brand Kit is almost ready.";
}

export function setStatus(dom, message, type = "normal") {
  dom.statusText.textContent = message;
  dom.statusBox.classList.toggle("error", type === "error");
  dom.statusBox.classList.toggle("warning", type === "warning");
}

export function addActivity(dom, message, type = "normal") {
  const item = document.createElement("li");
  item.className = `activity-item ${type}`;
  item.textContent = `${timeLabel()} - ${message}`;
  dom.activityList.prepend(item);
  trimActivity(dom.activityList);
}

export function renderProduct(dom, product, state) {
  dom.summary.hidden = false;
  dom.productIdInput.value = product.id;
  dom.originalCount.textContent = String(product.originalImages?.length || 0);
  dom.generatedCount.textContent = String(totalOutputCount(product));
  dom.productStatus.textContent = product.status || "-";
  if (dom.output2Count) {
    dom.output2Count.textContent = String(product.instagramImages?.length || 0);
  }
  if (dom.output2Status) {
    dom.output2Status.textContent = product.instagramImages?.length ? "Available" : "Waiting";
  }
  renderGallery(dom, collectRenderableImages(product), state.galleryFilter, state.instagramSelection);
}

export function renderOutputOneEstimate(dom, state) {
  if (!dom.gptCostPanel) return;

  if (state.generationMode !== "gpt") {
    dom.gptCostPanel.hidden = true;
    return;
  }

  dom.gptCostPanel.hidden = false;
  const estimate = state.outputOneEstimate;

  if (!state.product?.id && !state.batch?.id) {
    dom.gptCostTitle.textContent = "Load a product first";
    dom.gptCostSummary.textContent = "GPT cost estimate appears here before paid Output 1 generation.";
    resetEstimateValues(dom);
    return;
  }

  if (!estimate) {
    dom.gptCostTitle.textContent = "Loading estimate...";
    dom.gptCostSummary.textContent = "Calculating request count, quality, and estimated GPT image tokens.";
    resetEstimateValues(dom);
    return;
  }

  dom.gptCostTitle.textContent = estimate.productCount
    ? `${estimate.productCount} product(s) - Output 1`
    : "This product - Output 1";
  dom.gptCostSummary.textContent = "Review this estimate before clicking Generate Output 1.";
  dom.gptCostEstimated.textContent = money(estimate.estimatedUsd);
  dom.gptCostCeiling.textContent = money(estimate.safetyCeilingUsd);
  dom.gptCostRequests.textContent = String(estimate.requestCount || 0);
  dom.gptCostQuality.textContent = estimate.quality || "medium";
  dom.gptCostDetail.textContent =
    `Estimated tokens: ${number(estimate.textInputTokens)} text input, ` +
    `${number(estimate.imageInputTokens)} image input, ` +
    `${number(estimate.imageOutputTokens)} image output.`;
}

export function renderBatch(dom, result) {
  const batch = result.batch;
  const products = result.products || [];
  dom.summary.hidden = false;
  dom.batchSummary.hidden = false;
  dom.batchIdText.textContent = batch.id;
  dom.batchStatusText.textContent = batch.status;
  renderBatchProgress(dom, batch, products.length);
  renderBatchProducts(dom, products);
}

export function renderGallery(dom, images, filter, selection = new Map()) {
  const filtered = filterImages(images, filter);
  dom.galleryGrid.replaceChildren();
  dom.galleryCount.textContent = `${filtered.length} ${filtered.length === 1 ? "image" : "images"}`;
  dom.galleryGrid.hidden = filtered.length === 0;
  dom.emptyState.hidden = filtered.length > 0;

  for (const image of filtered) {
    dom.galleryGrid.append(galleryNode(dom, image, selection));
  }
}

export function setBusy(dom, state, label = "Working") {
  const busy = state.busy;
  const brandingReady = state.branding?.ready === true;
  const tryFree = state.generationMode === TRY_FREE_MODE;
  dom.uploadButton.disabled = busy;
  dom.uploadButton.textContent = busy ? label : "Upload references";
  dom.brandingUploadButton.disabled = busy;
  dom.brandingUploadButton.textContent = busy ? label : "Save brand assets";
  dom.debugPreviewButton.disabled = busy || !brandingReady || !tryFree;
  dom.debugPreviewButton.textContent = busy ? label : tryFree ? "Generate free preview" : "Select Try Free first";
  dom.debugSaveButton.disabled = busy;
  dom.generateButton.disabled = busy || tryFree || !state.product?.id;
  dom.generateButton.textContent = busy ? label : tryFree ? "Output 1 disabled in Try Free" : "Generate Output 1 images";
  dom.refreshButton.disabled = busy || !state.product?.id;
  if (dom.refreshOutput2Button) {
    dom.refreshOutput2Button.disabled = busy || !state.product?.id;
  }
  dom.loadButton.disabled = busy;
  dom.batchImportButton.disabled = busy || tryFree;
  dom.batchImportButton.textContent = busy ? label : tryFree ? "Use Try Free panel" : "Import folder";
  dom.batchGenerateButton.disabled = busy || tryFree || !state.batch?.id;
  dom.batchGenerateButton.textContent = busy ? label : tryFree ? "Output 1 disabled in Try Free" : "Generate Output 1 images";
  if (dom.directInstagramUploadButton) {
    dom.directInstagramUploadButton.disabled = busy;
    dom.directInstagramUploadButton.textContent = busy ? label : "Add to Instagram Selection";
  }
  if (dom.directInstagramUploadInput) {
    dom.directInstagramUploadInput.disabled = busy;
  }
  updateInstagramButton(dom, state);
}

export function updateFilterButtons(dom, filter) {
  for (const button of dom.filterButtons) {
    button.classList.toggle("active", button.dataset.filter === filter);
  }
}

function renderBatchProducts(dom, products) {
  dom.batchProducts.replaceChildren();
  for (const product of products) {
    dom.batchProducts.append(batchRow(product));
  }
}

function batchRow(product) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `batch-row status-${product.status}`;
  row.dataset.productId = product.id;
  row.append(batchCell(product.source_product_code || product.id), batchCell(product.status));
  return row;
}

function batchCell(text) {
  const cell = document.createElement("span");
  cell.textContent = text || "-";
  return cell;
}

function renderBatchProgress(dom, batch, productCount) {
  const total = batch.total_products || productCount || 0;
  const done = Number(batch.successful_products || 0) + Number(batch.failed_products || 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  dom.batchProgress.style.width = `${progress}%`;
}

function filterImages(images, filter) {
  if (filter === "all") return images;
  return images.filter((image) => image.outputType === filter);
}

function galleryNode(dom, image, selection) {
  const node = dom.galleryTemplate.content.cloneNode(true);
  const item = node.querySelector(".gallery-item");
  const link = node.querySelector("a");
  const img = node.querySelector("img");
  const title = node.querySelector("strong");
  const badge = node.querySelector(".image-badge");
  const meta = node.querySelector(".gallery-caption span");
  const selector = node.querySelector(".instagram-select");
  const checkbox = selector.querySelector("input");
  link.href = image.url;
  img.src = image.url;
  img.alt = displayNames[image.role] || image.role;
  title.textContent = galleryTitle(image);
  renderImageBadge(badge, image);
  meta.textContent = image.filename;
  item.dataset.generatedImageId = image.id || "";
  item.dataset.productId = image.productId || "";
  item.dataset.batchId = image.batchId || "";
  item.dataset.role = image.role || "";
  item.dataset.filename = image.filename || "";
  item.dataset.productCode = image.productCode || image.productId || "";
  item.dataset.provider = image.provider || image.providerMode || "";
  item.dataset.outputKind = image.outputKind || "";
  item.dataset.isMock = image.isMock ? "true" : "false";

  if (image.outputType === "gallery" && image.id) {
    selector.hidden = false;
    checkbox.checked = selection.has(String(image.id));
  }

  return node;
}

function renderImageBadge(badge, image) {
  const text = image.status === "preview" ? "Local preview" : "";
  badge.hidden = !text;
  badge.textContent = text;
}

function galleryTitle(image) {
  const role = image.sourceRole || image.role;
  if (image.outputType === "gallery" && image.isMock) {
    return `Try Free / Mock Output 1 - ${displayNames[role] || role}`;
  }
  if (image.outputType === "gallery" && image.outputKind === "direct_upload") {
    return `Direct Instagram Source - ${displayNames[role] || role}`;
  }
  if (image.outputType === "instagram" && image.outputKind === "local_preview") {
    return `Try Free / Local Preview - ${displayNames[role] || role}`;
  }
  const prefix = image.outputType === "instagram" ? "Output 2 " : "Output 1 ";
  return `${prefix}${displayNames[role] || role}`;
}

function totalOutputCount(product) {
  return Number(product.generatedImages?.length || 0) + Number(product.instagramImages?.length || 0);
}

function resetEstimateValues(dom) {
  dom.gptCostEstimated.textContent = "$0.0000";
  dom.gptCostCeiling.textContent = "$0.0000";
  dom.gptCostRequests.textContent = "0";
  dom.gptCostQuality.textContent = "medium";
  dom.gptCostDetail.textContent = "";
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function providerLabel(provider) {
  if (provider === "gpt" || provider === "openai") return "GPT";
  if (provider === TRY_FREE_MODE) return "Try Free";
  if (provider === "gemini") return "Gemini";
  return provider || "-";
}

function renderAsset(dom, name, asset = {}) {
  const accessible = asset.accessible === true;
  const pill = document.querySelector(`#${name}-access`);
  const card = document.querySelector(`[data-asset-card="${name}"]`);
  const status = document.querySelector(`#${name}-status`);
  const meta = document.querySelector(`#${name}-meta`);
  const preview = document.querySelector(`#${name}-preview`);

  pill.classList.remove("pending", "ready", "missing");
  pill.classList.add(accessible ? "ready" : "missing");
  pill.setAttribute("aria-label", `${name}: ${accessible ? "accessible" : "not accessible"}`);
  card.classList.toggle("ready", accessible);
  status.textContent = accessible ? "Accessible to the tool" : "Not accessible";
  meta.textContent = accessible
    ? `${asset.filename} · ${asset.width || "?"} × ${asset.height || "?"} · ${asset.source}`
    : "Required before Instagram generation";

  if (preview && asset.url) {
    preview.src = `${asset.url}?v=${Date.now()}`;
    preview.hidden = false;
  } else if (preview) {
    preview.removeAttribute("src");
    preview.hidden = true;
  }
}


function trimActivity(list) {
  while (list.children.length > 8) {
    list.lastElementChild.remove();
  }
}

function timeLabel() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
