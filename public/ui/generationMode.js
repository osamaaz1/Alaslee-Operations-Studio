// Controls paid Output 1 modes and the no-cost Try Free Output 2 preview mode.

// This value matches the backend provider contract. The UI labels it "Try Free".
export const TRY_FREE_MODE = "free-test";

export function applyGenerationMode(dom, state, actions, options = {}) {
  state.generationMode = dom.providerSelect.value;
  const tryFree = isTryFreeMode(state);
  document.body.classList.toggle("try-free-mode", tryFree);
  dom.forceGenerateInput.disabled = tryFree;
  if (tryFree) dom.forceGenerateInput.checked = false;
  dom.modeHelper.textContent = modeMessage(tryFree);
  actions.renderBusy(dom, state);
  actions.refreshOutputOneEstimate?.();

  if (tryFree && options.announce !== false) {
    actions.warn("Try Free mode selected - no Gemini or ChatGPT calls will be made.");
    actions.switchView(dom, "debug");
  }
}

export function isTryFreeMode(state) {
  return state.generationMode === TRY_FREE_MODE;
}

export function requireTryFreeMode(dom, state, actions, announce = false) {
  if (isTryFreeMode(state)) return true;
  dom.debugLiveMessage.textContent = "Choose Try Free mode to run the no-cost Output 2 test.";
  dom.debugLiveStatus.classList.remove("updating");
  dom.debugLiveStatus.classList.add("error");
  if (announce) actions.warn("Choose Try Free in Generation mode before running the free Output 2 preview.");
  return false;
}

function modeMessage(tryFree) {
  if (tryFree) return "Try Free creates Output 2 local previews only. It does not generate Output 1 or call AI.";
  return "Gemini and ChatGPT generate Output 1. Output 2 remains a separate manual Instagram step.";
}
