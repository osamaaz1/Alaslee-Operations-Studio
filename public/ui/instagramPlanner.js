// Renders and validates the explicit Instagram selection planner.

import { displayNames } from "./displayNames.js";

export function renderInstagramPlanner(dom, state) {
  renderInstagramProfileOptions(dom, state);
  const selected = [...state.instagramSelection.values()];
  dom.selectedInstagramList.replaceChildren();

  if (selected.length === 0) {
    dom.instagramValidationMessage.textContent = "Select at least one Output 1 ecommerce image.";
    renderOutput2Estimate(dom, state);
    updateInstagramButton(dom, state);
    return;
  }

  for (const group of selectedProductGroups(selected)) {
    dom.selectedInstagramList.append(productMetaNode(group, state));
  }

  refreshInstagramPlannerValidation(dom, state);
}

export function refreshInstagramPlannerValidation(dom, state) {
  dom.instagramValidationMessage.textContent = instagramValidationMessage(state);
  renderOutput2Estimate(dom, state);
  updateInstagramButton(dom, state);
}

export function instagramSelectionReady(state) {
  if (state.instagramSelection.size === 0) return false;
  if (!state.instagramProfileId) return false;
  if (state.branding?.ready !== true) return false;
  if (selectionRequiresPriceLabel(state) && state.branding?.priceLabelReady !== true) return false;

  for (const group of selectedProductGroups([...state.instagramSelection.values()])) {
    const meta = state.instagramProductMeta.get(group.productId) || {};
    if (!validPrice(meta.price) || !validSku(meta.sku)) return false;
  }

  return true;
}

export function updateInstagramButton(dom, state) {
  dom.generateInstagramButton.disabled = state.busy || !instagramSelectionReady(state);
  dom.generateInstagramButton.textContent =
    state.instagramSelection.size > 0 && !selectionRequiresPriceLabel(state)
      ? "Generate Try Free / Local Preview"
      : "Generate selected Instagram images";
}

function productMetaNode(group, state) {
  const row = document.createElement("div");
  const price = document.createElement("input");
  const sku = document.createElement("input");
  const meta = state.instagramProductMeta.get(group.productId) || {};
  row.className = "selected-product-row";
  row.dataset.productId = group.productId;
  row.append(selectionSummary(group), fieldNode("SKU", "sku", sku), fieldNode("Price", "price", price));
  price.value = meta.price || "";
  sku.value = meta.sku || "";
  return row;
}

function selectionSummary(group) {
  const summary = document.createElement("div");
  const title = document.createElement("strong");
  const roles = document.createElement("span");
  title.textContent = group.productCode;
  roles.textContent = group.items.map((item) => displayNames[item.role] || item.role).join(", ");
  summary.append(title, roles);
  return summary;
}

function fieldNode(label, name, input) {
  const wrapper = document.createElement("label");
  const text = document.createElement("span");
  wrapper.className = "field inline-field";
  text.textContent = label;
  input.name = name;
  input.autocomplete = "off";
  input.required = true;
  input.maxLength = 80;
  if (name === "price") {
    input.inputMode = "decimal";
    input.placeholder = "$129";
  }
  if (name === "sku") {
    input.placeholder = "SKU-001";
  }
  wrapper.append(text, input);
  return wrapper;
}

function renderInstagramProfileOptions(dom, state) {
  const formats = state.composition?.formats || [];
  const current = state.instagramProfileId || dom.instagramProfile.value;
  dom.instagramProfile.replaceChildren(optionNode("", "Choose profile"));

  for (const format of formats) {
    dom.instagramProfile.append(optionNode(format.id, `${format.ratio} ${format.label}`));
  }

  dom.instagramProfile.value = formats.some((format) => format.id === current) ? current : "";
  state.instagramProfileId = dom.instagramProfile.value;
}

function optionNode(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function selectedProductGroups(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.productId)) {
      groups.set(item.productId, {
        productId: item.productId,
        productCode: item.productCode || item.productId,
        items: [],
      });
    }
    groups.get(item.productId).items.push(item);
  }
  return [...groups.values()];
}

function instagramValidationMessage(state) {
  if (state.instagramSelection.size === 0) return "Select at least one Output 1 ecommerce image.";
  if (!state.instagramProfileId) return "Choose an Instagram output profile.";
  if (state.branding?.ready !== true) return "Brand background, logo, and footer must be accessible.";
  if (selectionRequiresPriceLabel(state) && state.branding?.priceLabelReady !== true) {
    return "Price-label reference image must be accessible for real GPT price-label generation.";
  }
  if (!instagramSelectionReady(state)) return "Enter Price and SKU for every selected product.";
  return "Ready to generate Output 2 Instagram images.";
}

function allPricesValid(state) {
  return selectedProductGroups([...state.instagramSelection.values()]).every((group) =>
    validPrice(state.instagramProductMeta.get(group.productId)?.price),
  );
}

function allSkusValid(state) {
  return selectedProductGroups([...state.instagramSelection.values()]).every((group) =>
    validSku(state.instagramProductMeta.get(group.productId)?.sku),
  );
}

function validPrice(value) {
  const text = cleanMetadata(value);
  return Boolean(text) && /\d/.test(text);
}

function validSku(value) {
  return Boolean(cleanMetadata(value));
}

function cleanMetadata(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 80 || /[\r\n\t]/.test(text)) return "";
  return text;
}

function selectionRequiresPriceLabel(state) {
  return [...state.instagramSelection.values()].some((item) => item.provider !== "free-test");
}

function renderOutput2Estimate(dom, state) {
  if (!dom.output2CostPanel) return;

  if (state.instagramSelection.size === 0) {
    dom.output2CostPanel.hidden = true;
    return;
  }

  dom.output2CostPanel.hidden = false;

  if (!state.instagramProfileId) {
    dom.output2CostTitle.textContent = "Choose an output profile";
    dom.output2CostSummary.textContent = "Output 2 cost is calculated after selecting a profile.";
    resetOutput2Estimate(dom);
    return;
  }

  if (!state.instagramEstimate) {
    dom.output2CostTitle.textContent = "Loading estimate...";
    dom.output2CostSummary.textContent = "Calculating GPT price-label requests for selected images.";
    resetOutput2Estimate(dom);
    return;
  }

  const estimate = state.instagramEstimate;
  dom.output2CostTitle.textContent = `${estimate.selectedImageCount} selected image(s) - ${estimate.profileId}`;
  dom.output2CostSummary.textContent =
    estimate.paidRequestCount > 0
      ? "Review this estimate before generating paid GPT price labels."
      : "Try Free selections use local composition only. No GPT cost.";
  dom.output2CostEstimated.textContent = money(estimate.estimatedUsd);
  dom.output2CostCeiling.textContent = money(estimate.safetyCeilingUsd);
  dom.output2CostRequests.textContent = String(estimate.paidRequestCount || 0);
  dom.output2CostLocal.textContent = String(estimate.localPreviewCount || 0);
  dom.output2CostDetail.textContent =
    `Estimated tokens: ${number(estimate.textInputTokens)} text input, ` +
    `${number(estimate.imageInputTokens)} image input, ` +
    `${number(estimate.imageOutputTokens)} image output.`;
}

function resetOutput2Estimate(dom) {
  dom.output2CostEstimated.textContent = "$0.0000";
  dom.output2CostCeiling.textContent = "$0.0000";
  dom.output2CostRequests.textContent = "0";
  dom.output2CostLocal.textContent = "0";
  dom.output2CostDetail.textContent = "";
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}
