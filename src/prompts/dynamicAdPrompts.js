// Builds one dynamic advertising output from editable scene prompts plus hard safety invariants.

import { getAllPrompts, getDefaultPrompts } from "../services/promptService.js";
import {
  DYNAMIC_AD_ROLE,
  GENERATION_MODES,
  getDynamicAdFormat,
  normalizeGenerationSettings,
} from "../domain/generationSettings.js";

const promptIdBySelection = Object.freeze({
  hand: "dynamic-hand",
  decor: "dynamic-decor",
  "person:cafe": "dynamic-person-cafe",
  "person:classic-street": "dynamic-person-classic-street",
  "person:formal-modern": "dynamic-person-formal-modern",
  "person:saudi-modern": "dynamic-person-saudi-modern",
});

const dynamicAdInvariant = `Mandatory product and advertising rules:
- Use the uploaded product references as the absolute source of truth for the eyeglasses.
- Preserve exactly the real frame geometry, lens shape and size, bridge, rims, hinges, temple arms, nose pads, color, transparency, finish, proportions, lens tint, and every genuine visible product detail.
- Do not redesign, simplify, mirror, thicken, slim, recolor, stretch, duplicate, or invent any part of the glasses.
- Create exactly one photorealistic, full-bleed, professionally art-directed advertisement with the eyeglasses as the primary sharp focus.
- Keep the complete visible front frame and lenses inside the canvas, unobstructed, level, and large enough to inspect.
- Preserve a genuine mark only in its natural position on the eyewear and only when its exact symbol or lettering is completely legible and unambiguous in the references. If confidence is not absolute, omit the mark rather than infer it. Never reconstruct, enlarge, detach, repeat, or place a standalone advertising logo.
- Add no prices, captions, slogans, badges, watermarks, fake logos, invented text, unrelated packaging, or other eyewear.
- Keep all people adult, realistic, modestly styled, culturally respectful, and non-sexualized.
- Aim for the photographic craft and restraint of a premium international eyewear campaign without copying a named brand or an existing campaign.`;

const formatInstructions = Object.freeze({
  square: `Canvas requirement: create a full-bleed square composition. Balance the subject for a premium social post without borders, letterboxing, added text, or a standalone logo.`,
  portrait: `Canvas requirement: create a full-bleed vertical 9:16 Story/Reel composition. Keep the eyeglasses and any face within the central safe area, with intentional depth above and below, without borders, letterboxing, added text, or a standalone logo.`,
});

export async function getDynamicAdOutput(options = {}) {
  const settings = normalizeGenerationSettings({
    ...options,
    generationMode: GENERATION_MODES.DYNAMIC_AD,
  });
  const prompts = await availablePrompts();
  return dynamicOutputFrom(prompts, settings);
}

export function getDefaultDynamicAdOutput(options = {}) {
  const settings = normalizeGenerationSettings({
    ...options,
    generationMode: GENERATION_MODES.DYNAMIC_AD,
  });
  return dynamicOutputFrom(getDefaultPrompts(), settings);
}

function dynamicOutputFrom(prompts, settings) {
  const selectionKey = settings.creativeStyle === "person"
    ? `${settings.creativeStyle}:${settings.lifestyleScene}`
    : settings.creativeStyle;
  const promptId = promptIdBySelection[selectionKey];
  const selected = prompts.find((prompt) => prompt.id === promptId);
  if (!selected) {
    throw new Error(`Dynamic advertising prompt "${promptId}" is unavailable.`);
  }

  const format = getDynamicAdFormat(settings.outputFormat);
  const genderInstruction = settings.creativeStyle === "person"
    ? settings.modelGender === "male"
      ? "Mandatory person selection: show exactly one real adult man wearing the eyeglasses."
      : "Mandatory person selection: show exactly one real adult woman wearing the eyeglasses."
    : null;

  return {
    role: DYNAMIC_AD_ROLE,
    label: "Premium Creative Advertisement",
    fileSuffix: [
      "dynamic",
      settings.creativeStyle,
      settings.lifestyleScene,
      settings.outputFormat,
    ].filter(Boolean).join("-"),
    prompt: [
      selected.text.trim(),
      dynamicAdInvariant,
      formatInstructions[settings.outputFormat],
      genderInstruction,
    ].filter(Boolean).join("\n\n"),
    aspectRatio: format.aspectRatio,
    imageSize: "2K",
    openAiRequestSize: format.openAiRequestSize,
    outputDimensions: {
      width: format.outputWidth,
      height: format.outputHeight,
    },
  };
}

async function availablePrompts() {
  try {
    return await getAllPrompts();
  } catch {
    return getDefaultPrompts();
  }
}
