import { getAllPrompts, getDefaultPrompts } from "../services/promptService.js";

// This is a transport-level invariant, not an editable creative instruction.
// Keep it appended even when an operator has saved custom gallery prompts.
const completeProductFramingInvariant = `Mandatory framing rule: zoom out and keep the entire product inside the canvas with at least 12% clean background on every side. No part of the frame, lenses, hinges, temple arms, or ear bends may touch or cross an image edge. Never return a close-up or cropped product.`;

const galleryOutputDefaults = galleryPromptsFrom(getDefaultPrompts());

export async function getGalleryOutputs() {
  let savedPrompts;
  try {
    savedPrompts = await getAllPrompts();
  } catch {
    return galleryOutputDefaults;
  }

  return galleryPromptsFrom(savedPrompts);
}

function galleryPromptsFrom(prompts) {
  return prompts
    .filter((prompt) => prompt.category === "gallery")
    .map((prompt) => ({
      role: prompt.role,
      label: prompt.label,
      fileSuffix: prompt.fileSuffix,
      prompt: `${prompt.text.trim()}\n\n${completeProductFramingInvariant}`,
    }));
}

export { galleryOutputDefaults as galleryOutputs };
