import { getAllPrompts, getDefaultPrompts } from "../services/promptService.js";

// This is a transport-level invariant, not an editable creative instruction.
// Keep it appended even when an operator has saved custom gallery prompts.
const completeProductFramingInvariant = `Mandatory framing rule: zoom out and keep the entire product inside the canvas with at least 12% clean background on every side. No part of the frame, lenses, hinges, temple arms, or ear bends may touch or cross an image edge. Never return a close-up or cropped product.`;
const wornProductInvariant = `Mandatory eyewear fidelity rule: the complete visible front frame and lenses must stay inside the canvas and remain sharp. Preserve every visible product detail exactly from the references. Natural occlusion of the temple arms behind the real person's ears is allowed, but never alter or invent their design.`;

const galleryOutputDefaults = galleryPromptsFrom(getDefaultPrompts());

export async function getGalleryOutputs(options = {}) {
  let savedPrompts;
  try {
    savedPrompts = await getAllPrompts();
  } catch {
    return selectGalleryOutputs(galleryOutputDefaults, options);
  }

  return selectGalleryOutputs(galleryPromptsFrom(savedPrompts), options);
}

function galleryPromptsFrom(prompts) {
  return prompts
    .filter((prompt) => prompt.category === "gallery")
    .map((prompt) => ({
      role: prompt.role,
      label: prompt.label,
      fileSuffix: prompt.fileSuffix,
      prompt: `${prompt.text.trim()}\n\n${prompt.role === "model" ? wornProductInvariant : completeProductFramingInvariant}`,
    }));
}

export { galleryOutputDefaults as galleryOutputs };

function selectGalleryOutputs(outputs, { includeModel = true, modelGender } = {}) {
  return outputs.filter((output) => includeModel || output.role !== "model").map((output) => {
    if (output.role !== "model") return output;
    const genderInstruction = modelGender === "male"
      ? "Mandatory model gender: show exactly one real adult man wearing the eyeglasses."
      : modelGender === "female"
        ? "Mandatory model gender: show exactly one real adult woman wearing the eyeglasses."
        : "Mandatory model gender: follow the explicit gender selected by the operator.";
    return { ...output, prompt: `${output.prompt}\n\n${genderInstruction}` };
  });
}
