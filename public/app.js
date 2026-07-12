// Coordinates console events, API calls, and UI rendering.

import {
  estimateBatchOutputOne as apiEstimateBatchOutputOne,
  estimateProductOutputOne as apiEstimateProductOutputOne,
  generateBatch as apiGenerateBatch,
  generateProduct as apiGenerateProduct,
  importBatchFolder,
  loadBrandingAssets as apiLoadBrandingAssets,
  loadCompositionSettings as apiLoadCompositionSettings,
  loadHealth as apiLoadHealth,
  loadProduct as apiLoadProduct,
  loadSallaStatus as apiLoadSallaStatus,
  uploadBrandingAssets as apiUploadBrandingAssets,
  uploadProduct as apiUploadProduct,
} from "./apiClient.js";
import { dom } from "./ui/dom.js";
import { state } from "./ui/state.js";
import {
  addActivity,
  renderBatch,
  renderBrandingStatus,
  renderGallery,
  renderHealth,
  renderHealthError,
  renderOutputOneEstimate,
  renderProduct,
  setBusy as renderBusy,
  setStatus,
  updateFilterButtons,
} from "./ui/render.js";
import { bindDataWorkspace, refreshDataWorkspace } from "./ui/dataWorkspace.js";
import { applyCompositionSettings, bindDebuggingEvents } from "./ui/debuggingWorkflow.js";
import { bindBrandAssetFileNames, bindProductFileNames, clearSelectedAssetNames } from "./ui/fileInputs.js";
import { collectRenderableImages } from "./ui/galleryImages.js";
import { applyGenerationMode, isTryFreeMode } from "./ui/generationMode.js";
import { renderInstagramPlanner } from "./ui/instagramPlanner.js";
import { bindInstagramWorkflow, clearInstagramPlannerState } from "./ui/instagramWorkflow.js";
import { refreshPrompts, bindPromptEvents } from "./ui/promptEditor.js";
import { switchPartition, switchView } from "./ui/viewSwitching.js";

init();

function init() {
  refreshHealth();
  refreshBranding();
  refreshCompositionSettings();
  refreshPrompts(dom, state, { succeed, warn, fail });
  bindProductFileNames(dom);
  bindBrandAssetFileNames(dom);
  bindPartitionNavigation();
  const dataActions = { succeed, warn, fail };
  bindDataWorkspace(dom, state, dataActions);
  bindDebuggingEvents(dom, state, { runOperation, succeed, warn, fail, acceptProduct });
  bindNavigation();
  bindGalleryFilters();
  bindWorkflowEvents();
  applyGenerationMode(dom, state, generationModeActions(), { announce: false });
  syncDebugVisibility();
  bindInstagramWorkflow(dom, state, { runOperation, succeed, warn, fail, refreshProduct, acceptProduct });
  bindPromptEvents(dom, state, { succeed, warn, fail });
  refreshDataWorkspace(dom, state, { warn });
  refreshSallaStatus();
  addActivity(dom, "Console ready");
  switchPartition(dom, state.activePartition);
}

async function refreshHealth() {
  try {
    renderHealth(dom, await apiLoadHealth());
  } catch {
    renderHealthError(dom);
  }
}

async function refreshBranding() {
  try {
    state.branding = await apiLoadBrandingAssets();
    renderBrandingStatus(dom, state.branding);
    renderInstagramPlanner(dom, state);
    renderBusy(dom, state);
  } catch (error) {
    state.branding = null;
    warn(error?.message || "Brand asset status unavailable");
  }
}

async function refreshCompositionSettings() {
  try {
    state.composition = await apiLoadCompositionSettings();
    applyCompositionSettings(dom, state, state.composition);
    renderInstagramPlanner(dom, state);
  } catch (error) {
    warn(error?.message || "Composition settings unavailable");
  }
}

async function refreshSallaStatus() {
  try {
    renderSallaStatus(await apiLoadSallaStatus());
  } catch {
    renderSallaStatus({ configured: false, message: "Salla unavailable" });
  }
}

function renderSallaStatus(status) {
  if (!dom.sallaStatusPill) return;
  const ready = status?.connected === true;
  dom.sallaStatusPill.classList.toggle("ready", ready);
  dom.sallaStatusPill.classList.toggle("missing", !ready);
  dom.sallaStatusText.textContent = ready ? "Salla connected" : sallaStatusText(status);
  dom.sallaStatusPill.title = status?.message || "";
}

function sallaStatusText(status) {
  if (status?.status === "not_connected") return "Salla token missing";
  if (status?.status === "auth_failed") return "Salla auth failed";
  if (status?.status === "connection_failed") return "Salla offline";
  return "Salla config missing";
}
function bindNavigation() {
  for (const button of dom.railButtons) {
    button.addEventListener("click", () => {
      if (button.dataset.view === "single") {
        setUploadMode("single");
        return;
      }
      switchView(dom, button.dataset.view);
    });
  }
  dom.openBrandKitButton.addEventListener("click", () => switchView(dom, "brand"));
  dom.openPromptsButton.addEventListener("click", () => switchView(dom, "prompts"));
}

function bindPartitionNavigation() {
  for (const button of dom.partitionButtons) {
    button.addEventListener("click", () => {
      state.activePartition = button.dataset.partition;
      switchPartition(dom, state.activePartition);
    });
  }
}

function bindGalleryFilters() {
  for (const button of dom.filterButtons) {
    button.addEventListener("click", () => applyGalleryFilter(button.dataset.filter));
  }
}

function bindWorkflowEvents() {
  dom.uploadForm.addEventListener("submit", uploadSingleProduct);
  dom.generateButton.addEventListener("click", generateGallery);
  dom.refreshButton.addEventListener("click", refreshProduct);
  dom.refreshOutput2Button.addEventListener("click", refreshProduct);
  dom.loadButton.addEventListener("click", loadProductFromInput);
  dom.batchForm.addEventListener("submit", importBatch);
  dom.batchGenerateButton.addEventListener("click", generateCurrentBatch);
  dom.batchProducts.addEventListener("click", loadProductFromBatchRow);
  dom.brandingForm.addEventListener("submit", uploadBranding);
  dom.providerSelect.addEventListener("change", () => applyGenerationMode(dom, state, generationModeActions()));
  dom.debuggingEnabled.addEventListener("change", syncDebugVisibility);
  dom.productIdInput.addEventListener("keydown", handleProductIdKeydown);
}

async function uploadSingleProduct(event) {
  event.preventDefault();
  await runOperation("Uploading product", async () => {
    const product = await apiUploadProduct(new FormData(dom.uploadForm));
    clearInstagramPlannerState(state);
    acceptProduct(product, "Upload complete");
  });
}

async function generateGallery() {
  if (isTryFreeMode(state)) {
    warn("Try Free mode does not generate Output 1. Use the free Output 2 preview.");
    switchView(dom, "debug");
    return;
  }
  if (!state.product?.id) {
    warn("Upload or load a product first");
    return;
  }

  if (state.generationMode === "gpt" && !(await confirmGptProductOutputOneCost())) {
    warn("GPT Output 1 generation cancelled before paid requests.");
    return;
  }

  await runOperation("Generating gallery", async () => {
    const product = await apiGenerateProduct(productPayload());
    clearInstagramPlannerState(state);
    acceptProduct(product, "Output 1 generated");
  });
}

async function refreshProduct(options = {}) {
  if (!state.product?.id) {
    warn("Enter a product ID first");
    return;
  }

  await runOperation("Refreshing product", async () => {
    const product = await apiLoadProduct(state.product.id);
    acceptProduct(product, options.quiet ? undefined : "Product refreshed");
  });
}

async function loadProductFromInput() {
  const productId = dom.productIdInput.value.trim();
  if (!productId) {
    warn("Enter a product ID");
    return;
  }

  await loadProductById(productId, "Product loaded");
}

async function importBatch(event) {
  event.preventDefault();
  if (isTryFreeMode(state)) {
    warn("Try Free mode does not import or generate batch Output 1. Use the free Output 2 preview.");
    switchView(dom, "debug");
    return;
  }
  await runOperation("Importing folder", async () => {
    const result = await importBatchFolder(batchPayload());
    clearInstagramPlannerState(state);
    acceptBatch(result, "Batch imported");
  });
}

async function generateCurrentBatch() {
  if (isTryFreeMode(state)) {
    warn("Try Free mode does not generate batch Output 1. Use the free Output 2 preview.");
    switchView(dom, "debug");
    return;
  }
  if (!state.batch?.id) {
    warn("Import a batch first");
    return;
  }
  if (state.batch.provider === "gpt" && !(await confirmGptBatchOutputOneCost())) {
    warn("GPT batch Output 1 generation cancelled before paid requests.");
    return;
  }

  await runOperation("Generating batch Output 1", async () => {
    const result = await apiGenerateBatch(batchGeneratePayload());
    clearInstagramPlannerState(state);
    acceptBatch(result, "Batch Output 1 generation finished");
  });
}

async function uploadBranding(event) {
  event.preventDefault();
  const formData = new FormData(dom.brandingForm);
  const hasFile = [...formData.values()].some((value) => value instanceof File && value.size > 0);
  if (!hasFile) {
    warn("Choose at least one brand asset to upload");
    return;
  }

  await runOperation("Saving brand assets", async () => {
    state.branding = await apiUploadBrandingAssets(formData);
    renderBrandingStatus(dom, state.branding);
    renderInstagramPlanner(dom, state);
    renderBusy(dom, state);
    dom.brandingForm.reset();
    clearSelectedAssetNames();
    succeed(brandUploadMessage(state.branding));
  });
}

async function loadProductFromBatchRow(event) {
  const row = event.target.closest("[data-product-id]");
  if (!row) return;

  await loadProductById(row.dataset.productId, "Batch product loaded");
  switchView(dom, "output1");
}

async function loadProductById(productId, successMessage) {
  await runOperation("Loading product", async () => {
    acceptProduct(await apiLoadProduct(productId), successMessage);
  });
}

async function runOperation(label, operation) {
  markBusy(true, label);
  setStatus(dom, label, "normal");

  try {
    await operation();
  } catch (error) {
    fail(error);
  } finally {
    markBusy(false);
  }
}

function acceptProduct(product, message) {
  state.product = product;
  renderProduct(dom, product, state);
  renderInstagramPlanner(dom, state);
  refreshVisibleOutputOneEstimate();
  if (message) succeed(message);
}

function acceptBatch(result, message) {
  state.batch = result.batch;
  renderBatch(dom, result);
  refreshVisibleOutputOneEstimate();
  if (message) succeed(message);
}

function applyGalleryFilter(filter) {
  state.galleryFilter = filter;
  updateFilterButtons(dom, filter);
  renderGallery(dom, collectRenderableImages(state.product), filter, state.instagramSelection);
}

async function confirmGptProductOutputOneCost() {
  try {
    const estimate = await loadProductOutputOneEstimate();
    return confirm(formatGptEstimateMessage(estimate));
  } catch (error) {
    fail(error);
    return false;
  }
}

async function confirmGptBatchOutputOneCost() {
  try {
    const estimate = await loadBatchOutputOneEstimate();
    return confirm(formatGptEstimateMessage(estimate));
  } catch (error) {
    fail(error);
    return false;
  }
}

function refreshVisibleOutputOneEstimate() {
  if (state.generationMode !== "gpt") {
    state.outputOneEstimate = null;
    state.outputOneEstimateKey = "";
    renderOutputOneEstimate(dom, state);
    return;
  }

  renderOutputOneEstimate(dom, state);
  const key = outputOneEstimateKey();
  if (!key || state.outputOneEstimateKey === key) return;

  state.outputOneEstimate = null;
  state.outputOneEstimateKey = key;
  renderOutputOneEstimate(dom, state);
  loadCurrentOutputOneEstimate(key);
}

async function loadCurrentOutputOneEstimate(key) {
  try {
    const estimate = key.startsWith("batch:")
      ? await apiEstimateBatchOutputOne(state.batch.id)
      : await apiEstimateProductOutputOne(state.product.id);
    if (state.outputOneEstimateKey !== key) return;
    state.outputOneEstimate = estimate;
    renderOutputOneEstimate(dom, state);
  } catch (error) {
    if (state.outputOneEstimateKey !== key) return;
    state.outputOneEstimate = null;
    renderOutputOneEstimate(dom, state);
    warn(error?.message || "GPT cost estimate unavailable");
  }
}

async function loadProductOutputOneEstimate() {
  if (state.outputOneEstimate && state.outputOneEstimateKey === `product:${state.product.id}`) {
    return state.outputOneEstimate;
  }
  const estimate = await apiEstimateProductOutputOne(state.product.id);
  state.outputOneEstimate = estimate;
  state.outputOneEstimateKey = `product:${state.product.id}`;
  renderOutputOneEstimate(dom, state);
  return estimate;
}

async function loadBatchOutputOneEstimate() {
  if (state.outputOneEstimate && state.outputOneEstimateKey === `batch:${state.batch.id}`) {
    return state.outputOneEstimate;
  }
  const estimate = await apiEstimateBatchOutputOne(state.batch.id);
  state.outputOneEstimate = estimate;
  state.outputOneEstimateKey = `batch:${state.batch.id}`;
  renderOutputOneEstimate(dom, state);
  return estimate;
}

function outputOneEstimateKey() {
  if (state.product?.id) return `product:${state.product.id}`;
  if (state.batch?.provider === "gpt") return `batch:${state.batch.id}`;
  return "";
}

function formatGptEstimateMessage(estimate) {
  const productLine = estimate.productCount
    ? `Products: ${estimate.productCount}\n`
    : `Product: ${estimate.productCode || estimate.productId}\n`;
  const roles = estimate.requestBreakdown
    ? estimate.requestBreakdown
        .map((item) => `- ${item.role}: ${item.referenceRoles.join(", ")} refs`)
        .join("\n")
    : "";

  return [
    "GPT Output 1 cost estimate",
    "",
    productLine +
      `Requests: ${estimate.requestCount}\n` +
      `Quality: ${estimate.quality}\n` +
      `Estimated cost: ${money(estimate.estimatedUsd)}\n` +
      `Safety ceiling: ${money(estimate.safetyCeilingUsd)}\n` +
      `Estimated tokens: ${number(estimate.textInputTokens)} text input, ${number(estimate.imageInputTokens)} image input, ${number(estimate.imageOutputTokens)} image output`,
    roles ? `\nFocused references:\n${roles}` : "",
    "\nThis is an estimate. OpenAI final billing can differ. Continue with paid GPT generation?",
  ].join("\n");
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function productPayload() {
  return {
    productId: state.product.id,
    force: dom.forceGenerateInput.checked,
    provider: state.generationMode,
  };
}

function batchPayload() {
  return {
    folderPath: dom.batchFolderInput.value,
    provider: state.generationMode,
    brandingEnabled: false,
  };
}

function generationModeActions() {
  return { renderBusy, warn, switchView, refreshOutputOneEstimate: refreshVisibleOutputOneEstimate };
}

function batchGeneratePayload() {
  return {
    batchId: state.batch.id,
    force: dom.forceGenerateInput.checked,
  };
}

function syncDebugVisibility() {
  const enabled = dom.debuggingEnabled.checked;
  dom.debugRailButton.hidden = !enabled;
  dom.debuggingPanel.hidden = !enabled;
  if (!enabled && dom.debuggingPanel.classList.contains("active")) {
    switchView(dom, "output1");
  }
}

function brandUploadMessage(branding) {
  if (branding.ready && branding.priceLabelReady) return "Brand kit and price-label reference ready";
  if (branding.ready && !branding.priceLabelReferenceReady) {
    return "Brand composition assets ready - add the price-label reference";
  }
  if (branding.ready && !branding.priceLabelEditor?.configured) {
    return "Brand composition assets ready - set OPENAI_API_KEY for price labels";
  }
  return "Assets saved - setup is still incomplete";
}

function handleProductIdKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  loadProductFromInput();
}

function markBusy(isBusy, label = "Working") {
  state.busy = isBusy;
  renderBusy(dom, state, label);
}

function succeed(message) {
  setStatus(dom, message, "normal");
  addActivity(dom, message);
}

function warn(message) {
  setStatus(dom, message, "warning");
  addActivity(dom, message, "warning");
}

function fail(error) {
  const message = error?.message || "Operation failed";
  setStatus(dom, message, "error");
  addActivity(dom, message, "error");
}
