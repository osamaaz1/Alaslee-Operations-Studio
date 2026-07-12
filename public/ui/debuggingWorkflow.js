// Coordinates the free Instagram composition preview and saved layout profiles.

import {
  createBrandingPreview as apiCreateBrandingPreview,
  saveCompositionSettings as apiSaveCompositionSettings,
  saveBrandingPreviewOutput as apiSaveBrandingPreviewOutput,
} from "../apiClient.js";
import { requireTryFreeMode } from "./generationMode.js";
import { switchView } from "./viewSwitching.js";

export function bindDebuggingEvents(dom, state, actions) {
  dom.debuggingForm.addEventListener("submit", (event) => generateDebugPreview(event, dom, state, actions));
  dom.debugSaveButton.addEventListener("click", () => saveDebugDefaults(dom, state, actions));
  dom.debugSampleInput.addEventListener("change", () => {
    dom.debugSampleName.textContent =
      dom.debugSampleInput.files?.[0]?.name || "Transparent PNG recommended - any dimensions";
    scheduleDebugPreview(dom, state, actions, 0);
  });

  for (const input of dom.debuggingForm.querySelectorAll('input[type="range"]')) {
    input.addEventListener("input", () => {
      updateRangeOutput(input);
      scheduleDebugPreview(dom, state, actions);
    });
  }

  dom.debuggingForm.elements.logoCorner.addEventListener(
    "change",
    () => scheduleDebugPreview(dom, state, actions),
  );
  dom.debuggingForm.elements.shadowEnabled.addEventListener(
    "change",
    () => scheduleDebugPreview(dom, state, actions, 0),
  );
  for (const input of dom.debuggingForm.querySelectorAll('input[name="format"]')) {
    input.addEventListener("change", (event) => handleDebugFormatChange(event, dom, state, actions));
  }
}

export function applyCompositionSettings(dom, state, settingsDocument) {
  const formatId = settingsDocument?.activeFormat || "portrait-4x5";
  const formatInput = dom.debuggingForm.querySelector(`input[name="format"][value="${formatId}"]`);
  if (formatInput) formatInput.checked = true;
  applyCompositionValues(dom, settingsDocument?.profiles?.[formatId] || settingsDocument?.settings || {});
  renderDebugFormat(dom, state, formatId);

  dom.debugSettingsSource.textContent =
    settingsDocument?.source === "saved"
      ? `${settingsDocument.format.ratio} is using its saved profile. Other formats keep separate profiles.`
      : "Using built-in profiles. Save each format after calibration to remember it permanently.";
}

async function generateDebugPreview(event, dom, state, actions) {
  event.preventDefault();
  if (!requireTryFreeMode(dom, state, actions, true)) return;
  clearTimeout(state.debugPreviewTimer);
  const applied = await requestDebugPreview(dom, state, actions, { announce: true });
  if (!applied) return;
  await savePreviewToOutputs(dom, state, actions);
}

function scheduleDebugPreview(dom, state, actions, delay = 220) {
  if (!requireTryFreeMode(dom, state, actions)) return;
  if (!dom.debugSampleInput.files?.[0] || !state.branding?.ready) return;

  clearTimeout(state.debugPreviewTimer);
  setDebugLiveStatus(dom, "Changes pending...", "updating");
  state.debugPreviewTimer = setTimeout(() => requestDebugPreview(dom, state, actions), delay);
}

async function requestDebugPreview(dom, state, actions, options = {}) {
  if (!requireTryFreeMode(dom, state, actions, options.announce)) return false;

  if (!state.branding?.ready) {
    if (options.announce) {
      actions.warn("Upload an accessible background, logo, and footer before previewing");
      switchView(dom, "brand");
    }
    return;
  }

  if (!dom.debugSampleInput.files?.[0]) {
    if (options.announce) actions.warn("Choose a background-free product image first");
    return;
  }

  state.debugPreviewController?.abort();
  const controller = new AbortController();
  const sequence = ++state.debugPreviewSequence;
  state.debugPreviewController = controller;
  setDebugLiveStatus(dom, "Updating preview...", "updating");
  dom.debugPreviewButton.textContent = "Updating preview...";

  try {
    const preview = await apiCreateBrandingPreview(debuggingFormData(dom), { signal: controller.signal });
    const applied = await showDebugPreview(dom, state, preview, sequence);
    if (!applied) return;

    setDebugLiveStatus(dom, "Live preview ready");
    if (options.announce) actions.succeed("Preview created locally - no AI API was called");
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (sequence !== state.debugPreviewSequence) return;

    setDebugLiveStatus(dom, "Preview update failed", "error");
    actions.fail(error);
    return false;
  } finally {
    if (sequence === state.debugPreviewSequence) {
      dom.debugPreviewButton.textContent = "Generate free preview";
    }
  }
}

async function savePreviewToOutputs(dom, state, actions) {
  await actions.runOperation("Saving free Instagram preview", async () => {
    const formData = debuggingFormData(dom);
    const existingProductId = state.product?.id || "";
    if (existingProductId) formData.set("productId", existingProductId);
    const product = await apiSaveBrandingPreviewOutput(formData);
    const message = existingProductId
      ? "Free Instagram preview saved to outputs"
      : "Preview test product created and saved to Instagram outputs";
    actions.acceptProduct(product, message);
  });
}

async function saveDebugDefaults(dom, state, actions) {
  await actions.runOperation("Saving production defaults", async () => {
    state.composition = await apiSaveCompositionSettings(compositionPayload(dom));
    applyCompositionSettings(dom, state, state.composition);
    actions.succeed(`${state.composition.format.ratio} layout saved as its production default`);
  });
}

function compositionPayload(dom) {
  const payload = {};
  const formData = debuggingFormData(dom);
  for (const [name, value] of formData.entries()) {
    if (name === "sample") continue;
    if (name === "logoCorner" || name === "format") {
      payload[name] = value;
    } else if (name === "shadowEnabled") {
      payload[name] = value === "true";
    } else {
      payload[name] = Number(value);
    }
  }
  return payload;
}

function debuggingFormData(dom) {
  const formData = new FormData(dom.debuggingForm);
  formData.set("shadowEnabled", String(dom.debuggingForm.elements.shadowEnabled.checked));
  return formData;
}

function applyCompositionValues(dom, settings) {
  for (const [name, value] of Object.entries(settings)) {
    const control = dom.debuggingForm.elements.namedItem(name);
    if (!control) continue;
    if (control.type === "checkbox") {
      control.checked = value === true;
    } else {
      control.value = String(value);
    }
    if (control.type === "range") updateRangeOutput(control);
  }
}

function handleDebugFormatChange(event, dom, state, actions) {
  const nextFormat = event.target.value;
  const currentFormat = state.composition?.activeFormat;
  if (currentFormat && state.composition?.profiles) {
    const { format, ...currentSettings } = compositionPayload(dom);
    state.composition.profiles[currentFormat] = currentSettings;
  }

  state.composition ||= {};
  state.composition.activeFormat = nextFormat;
  const nextSettings = state.composition.profiles?.[nextFormat] || state.composition.defaults || {};
  applyCompositionValues(dom, nextSettings);
  renderDebugFormat(dom, state, nextFormat);
  const format = state.composition?.formats?.find((candidate) => candidate.id === nextFormat);
  dom.debugSettingsSource.textContent =
    `${format?.ratio || nextFormat} profile restored. Save changes to make this format the production default.`;
  dom.debugPreviewImage.hidden = true;
  dom.debugPreviewPlaceholder.hidden = false;
  setDebugLiveStatus(dom, "Loading format profile...", "updating");
  scheduleDebugPreview(dom, state, actions, 0);
}

function renderDebugFormat(dom, state, formatId) {
  const format =
    state.composition?.formats?.find((candidate) => candidate.id === formatId) ||
    state.composition?.format ||
    { ratio: "4:5", label: "Feed portrait", width: 1080, height: 1350 };

  dom.debugPreviewDimensions.textContent = `${format.width} x ${format.height}`;
  dom.debugFormatLabel.textContent = `${format.ratio} ${format.label}`;
  dom.debugPreviewImage.parentElement.style.aspectRatio = `${format.width} / ${format.height}`;
}

function updateRangeOutput(input) {
  const output = document.querySelector(`#${input.name}-value`);
  if (output) output.value = `${input.value}%`;
}

async function showDebugPreview(dom, state, blob, sequence) {
  if (!blob || blob.size === 0 || !blob.type.startsWith("image/")) {
    throw new Error("The preview API did not return a valid image");
  }

  const nextUrl = URL.createObjectURL(blob);
  try {
    await decodePreviewImage(nextUrl);
  } catch {
    URL.revokeObjectURL(nextUrl);
    throw new Error("The browser could not decode the generated preview");
  }

  if (sequence !== state.debugPreviewSequence) {
    URL.revokeObjectURL(nextUrl);
    return false;
  }

  if (state.debugPreviewUrl) URL.revokeObjectURL(state.debugPreviewUrl);
  state.debugPreviewUrl = nextUrl;
  dom.debugPreviewImage.src = nextUrl;
  dom.debugPreviewImage.hidden = false;
  dom.debugPreviewPlaceholder.hidden = true;
  return true;
}

function decodePreviewImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = url;
  });
}

function setDebugLiveStatus(dom, message, type = "ready") {
  dom.debugLiveMessage.textContent = message;
  dom.debugLiveStatus.classList.toggle("updating", type === "updating");
  dom.debugLiveStatus.classList.toggle("error", type === "error");
}
