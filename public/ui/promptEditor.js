import { loadPrompts, savePrompts, resetPrompts as apiResetPrompts } from "../apiClient.js";
import { switchView } from "./viewSwitching.js";

export async function refreshPrompts(dom, state, actions) {
  try {
    state.prompts = await loadPrompts();
    renderPrompts(dom, state);
    dom.promptsStatus.textContent = `${state.prompts.length} prompts loaded`;
  } catch (error) {
    actions.warn("Failed to load prompts: " + error.message);
  }
}

export function renderPrompts(dom, state) {
  dom.promptsList.replaceChildren();
  if (!state.prompts?.length) return;

  for (const prompt of state.prompts) {
    dom.promptsList.append(promptCard(dom, prompt, state));
  }
}

function promptCard(dom, prompt, state) {
  const node = dom.promptEditorTemplate.content.cloneNode(true);
  const card = node.querySelector(".prompt-card");
  const category = node.querySelector(".prompt-category");
  const title = node.querySelector(".prompt-title");
  const textarea = node.querySelector(".prompt-text");
  const metaContainer = node.querySelector(".prompt-metadata");
  const restoreButton = node.querySelector(".prompt-restore");

  card.dataset.promptId = prompt.id;
  category.textContent = stageLabel(prompt);
  title.textContent = prompt.label || prompt.id;
  textarea.value = prompt.text;

  restoreButton.hidden = prompt.text === prompt.defaultText;
  restoreButton.addEventListener("click", () => {
    textarea.value = prompt.defaultText;
    restoreButton.hidden = true;
    markEdited(card, true);
  });

  textarea.addEventListener("input", () => {
    const current = textarea.value;
    restoreButton.hidden = current === prompt.defaultText;
    markEdited(card, true);
  });

  if (prompt.metadata) {
    metaContainer.append(metadataNode(prompt.metadata));
  }

  return node;
}

function stageLabel(prompt) {
  if (prompt.category === "gallery") return "Stage 4 - Output 1";
  if (prompt.category === "price-label") return "Stage 6 - Output 2";
  return "Workflow prompt";
}

function metadataNode(meta) {
  const container = document.createElement("div");
  container.className = "prompt-meta-grid";

  const fields = [
    { label: "Sent to", value: meta.sentTo },
    { label: "Provider", value: meta.provider },
    { label: "API method", value: meta.apiMethod },
    { label: "Reference images", value: meta.referenceImages },
    { label: "Purpose", value: meta.promptRole },
    { label: "Output format", value: meta.outputFormat },
  ];

  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "prompt-meta-row";
    const label = document.createElement("span");
    label.className = "prompt-meta-label";
    label.textContent = field.label;
    const value = document.createElement("span");
    value.className = "prompt-meta-value";
    value.textContent = field.value;
    row.append(label, value);
    container.append(row);
  }

  return container;
}

function markEdited(card, edited) {
  card.classList.toggle("prompt-edited", edited);
}

export function bindPromptEvents(dom, state, actions) {
  dom.promptsSaveButton.addEventListener("click", () => saveCurrentPrompts(dom, state, actions));

  dom.promptsResetButton.addEventListener("click", async () => {
    if (!confirm("Reset all prompts to their factory defaults? This cannot be undone.")) return;
    try {
      state.prompts = await apiResetPrompts();
      renderPrompts(dom, state);
      actions.succeed("All prompts reset to defaults");
    } catch (error) {
      actions.fail(error);
    }
  });
}

async function saveCurrentPrompts(dom, state, actions) {
  const cards = dom.promptsList.querySelectorAll(".prompt-card");
  const updates = [];

  for (const card of cards) {
    const id = card.dataset.promptId;
    const text = card.querySelector(".prompt-text").value;
    updates.push({ id, text });
  }

  try {
    state.prompts = await savePrompts(updates);
    renderPrompts(dom, state);
    actions.succeed(`${updates.length} prompt(s) saved`);
  } catch (error) {
    actions.fail(error);
  }
}
