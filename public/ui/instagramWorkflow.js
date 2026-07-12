// Coordinates explicit Instagram selection, metadata input, and generation actions.

import {
  estimateInstagram as apiEstimateInstagram,
  generateBatchInstagram as apiGenerateBatchInstagram,
  generateInstagram as apiGenerateInstagram,
  uploadInstagramSources as apiUploadInstagramSources,
} from "../apiClient.js";
import { renderInstagramPlanner, refreshInstagramPlannerValidation } from "./instagramPlanner.js";
import { switchView } from "./viewSwitching.js";

export function bindInstagramWorkflow(dom, state, actions) {
  dom.directInstagramUploadForm.addEventListener("submit", (event) =>
    uploadDirectInstagramSources(event, dom, state, actions),
  );
  dom.directInstagramUploadInput.addEventListener("change", () => updateDirectInstagramUploadSelection(dom, state));
  dom.galleryGrid.addEventListener("change", (event) => handleGallerySelection(event, dom, state));
  dom.instagramProfile.addEventListener("change", () => handleInstagramProfileChange(dom, state));
  dom.selectedInstagramList.addEventListener("input", (event) => handleInstagramMetaInput(event, dom, state));
  dom.generateInstagramButton.addEventListener("click", () => generateSelectedInstagram(dom, state, actions));
}

export function clearInstagramPlannerState(state) {
  state.instagramSelection.clear();
  state.instagramProductMeta.clear();
  state.instagramEstimate = null;
  state.instagramEstimateKey = "";
  clearInstagramEstimateTimer(state);
}

async function uploadDirectInstagramSources(event, dom, state, actions) {
  event.preventDefault();
  const files = directInstagramUploadFiles(dom, state);
  if (files.length === 0) {
    actions.warn("Choose at least one ready image for Instagram Selection.");
    return;
  }

  await actions.runOperation("Uploading Instagram source images", async () => {
    const product = await apiUploadInstagramSources(directInstagramUploadFormData(files));
    clearInstagramPlannerState(state);
    selectProductGeneratedImages(state, product);
    actions.acceptProduct(product, "Instagram source images ready");
    dom.directInstagramUploadForm.reset();
    state.directInstagramUploadFiles = [];
    updateDirectInstagramUploadName(dom, []);
    refreshInstagramEstimate(dom, state);
    switchView(dom, "instagram-selection");
  });
}

async function generateSelectedInstagram(dom, state, actions) {
  if (!(await confirmOutput2Cost(dom, state, actions))) {
    actions.succeed("Output 2 generation cancelled before paid requests.");
    return;
  }

  await actions.runOperation("Generating Output 2 Instagram images", async () => {
    const result = await instagramRequest(state);
    const message = `${result.successful} Output 2 Instagram image(s) generated, ${result.failed} failed`;
    removeSuccessfulInstagramSelections(state, result);
    actions.succeed(message);
    if (state.product?.id) {
      await actions.refreshProduct({ quiet: true });
    } else {
      renderInstagramPlanner(dom, state);
    }
    switchView(dom, "output2");
  });
}

function instagramRequest(state) {
  const payload = instagramPayload(state);
  if (useBatchEndpoint(state)) {
    return apiGenerateBatchInstagram(state.batch.id, payload);
  }
  return apiGenerateInstagram(payload);
}

function useBatchEndpoint(state) {
  const batchId = state.batch?.id;
  if (!batchId || state.instagramSelection.size === 0) return false;
  return [...state.instagramSelection.values()].every((item) => item.batchId === batchId);
}

function instagramPayload(state) {
  return {
    profileId: state.instagramProfileId,
    items: [...state.instagramSelection.values()].map((item) => ({
      productId: item.productId,
      generatedImageId: Number(item.generatedImageId),
    })),
    products: Object.fromEntries(state.instagramProductMeta),
  };
}

function selectProductGeneratedImages(state, product) {
  for (const image of product.generatedImages || []) {
    state.instagramSelection.set(String(image.id), {
      generatedImageId: String(image.id),
      productId: product.id,
      productCode: product.sourceProductCode || product.id,
      role: image.role,
      filename: image.filename,
      provider: image.provider,
      outputKind: image.outputKind,
      isMock: image.isMock === true,
    });
  }
}

async function confirmOutput2Cost(dom, state, actions) {
  let estimate;
  try {
    estimate = await loadInstagramEstimate(dom, state);
  } catch (error) {
    actions.fail(error);
    return false;
  }

  if (!estimate || estimate.paidRequestCount === 0) return true;
  return confirm(formatOutput2EstimateMessage(estimate));
}

function removeSuccessfulInstagramSelections(state, result) {
  for (const item of result.results || []) {
    if (item.success) {
      state.instagramSelection.delete(String(item.generatedImageId));
    }
  }
}

function handleGallerySelection(event, dom, state) {
  const checkbox = event.target.closest(".instagram-select input");
  if (!checkbox) return;

  const item = checkbox.closest(".gallery-item");
  const generatedImageId = item.dataset.generatedImageId;
  if (checkbox.checked) {
    state.instagramSelection.set(generatedImageId, {
      generatedImageId,
      productId: item.dataset.productId,
      batchId: item.dataset.batchId,
      productCode: item.dataset.productCode,
      role: item.dataset.role,
      filename: item.dataset.filename,
      provider: item.dataset.provider,
      outputKind: item.dataset.outputKind,
      isMock: item.dataset.isMock === "true",
    });
  } else {
    state.instagramSelection.delete(generatedImageId);
  }
  renderInstagramPlanner(dom, state);
  refreshInstagramEstimate(dom, state);
}

function handleInstagramProfileChange(dom, state) {
  state.instagramProfileId = dom.instagramProfile.value;
  renderInstagramPlanner(dom, state);
  refreshInstagramEstimate(dom, state);
}

function handleInstagramMetaInput(event, dom, state) {
  const row = event.target.closest("[data-product-id]");
  if (!row) return;

  const existing = state.instagramProductMeta.get(row.dataset.productId) || {};
  state.instagramProductMeta.set(row.dataset.productId, {
    ...existing,
    [event.target.name]: event.target.value,
  });
  refreshInstagramPlannerValidation(dom, state);
  refreshInstagramEstimate(dom, state, { debounce: true });
}

function refreshInstagramEstimate(dom, state, options = {}) {
  const key = instagramEstimateKey(state);
  clearInstagramEstimateTimer(state);
  if (!key) {
    state.instagramEstimate = null;
    state.instagramEstimateKey = "";
    refreshInstagramPlannerValidation(dom, state);
    return;
  }

  if (state.instagramEstimateKey === key) return;
  state.instagramEstimate = null;
  state.instagramEstimateKey = key;
  refreshInstagramPlannerValidation(dom, state);

  const load = () => {
    state.instagramEstimateTimer = null;
    loadInstagramEstimate(dom, state).catch(() => {
      if (state.instagramEstimateKey !== key) return;
      state.instagramEstimate = null;
      refreshInstagramPlannerValidation(dom, state);
    });
  };

  if (options.debounce) {
    state.instagramEstimateTimer = setTimeout(load, 450);
    return;
  }

  load();
}

function clearInstagramEstimateTimer(state) {
  if (!state.instagramEstimateTimer) return;
  clearTimeout(state.instagramEstimateTimer);
  state.instagramEstimateTimer = null;
}

async function loadInstagramEstimate(dom, state) {
  const key = instagramEstimateKey(state);
  if (!key) return null;
  if (state.instagramEstimate && state.instagramEstimateKey === key) return state.instagramEstimate;

  const estimate = await apiEstimateInstagram(instagramPayload(state));
  if (state.instagramEstimateKey !== key) return estimate;
  state.instagramEstimate = estimate;
  refreshInstagramPlannerValidation(dom, state);
  return estimate;
}

function instagramEstimateKey(state) {
  if (state.instagramSelection.size === 0 || !state.instagramProfileId) return "";
  const selectionKey = [...state.instagramSelection.values()]
    .map((item) => `${item.productId}:${item.generatedImageId}:${item.provider}`)
    .sort()
    .join("|");
  const metaKey = JSON.stringify(Object.fromEntries(state.instagramProductMeta));
  return `${state.instagramProfileId}|${selectionKey}|${metaKey}`;
}

function formatOutput2EstimateMessage(estimate) {
  return [
    "Output 2 GPT cost estimate",
    "",
    `Selected images: ${estimate.selectedImageCount}`,
    `GPT price-label requests: ${estimate.paidRequestCount}`,
    `Local previews: ${estimate.localPreviewCount}`,
    `Quality: ${estimate.quality}`,
    `Estimated cost: ${money(estimate.estimatedUsd)}`,
    `Safety ceiling: ${money(estimate.safetyCeilingUsd)}`,
    `Estimated tokens: ${number(estimate.textInputTokens)} text input, ${number(estimate.imageInputTokens)} image input, ${number(estimate.imageOutputTokens)} image output`,
    "",
    "This is an estimate. OpenAI final billing can differ. Continue with paid Output 2 generation?",
  ].join("\n");
}

function updateDirectInstagramUploadSelection(dom, state) {
  state.directInstagramUploadFiles = [...(dom.directInstagramUploadInput.files || [])].filter((file) => file.size > 0);
  updateDirectInstagramUploadName(dom, state.directInstagramUploadFiles);
}

function directInstagramUploadFiles(dom, state) {
  const inputFiles = [...(dom.directInstagramUploadInput.files || [])].filter((file) => file.size > 0);
  if (inputFiles.length > 0) {
    state.directInstagramUploadFiles = inputFiles;
    return inputFiles;
  }
  return state.directInstagramUploadFiles || [];
}

function directInstagramUploadFormData(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file, file.name);
  }
  return formData;
}

function updateDirectInstagramUploadName(dom, files) {
  if (files.length === 0) {
    dom.directInstagramUploadName.textContent = "Choose JPG, PNG, or WEBP";
    return;
  }
  if (files.length === 1) {
    dom.directInstagramUploadName.textContent = files[0].name;
    return;
  }
  dom.directInstagramUploadName.textContent = `${files.length} images selected`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}
