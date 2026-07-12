import fs from "node:fs/promises";
import path from "node:path";
import { writeFileEnsured } from "../utils/files.js";
import { AppError } from "../utils/errors.js";
import { storagePaths } from "../config.js";

const promptsPath = path.join(storagePaths.brandingDir, "prompts.json");

const ecommerceBasePrompt = `Create exactly one premium ecommerce product image of the eyeglasses.

Use the uploaded product references as the source of truth. Preserve the real product:
- exact frame geometry, lens shape, lens size, bridge, rims, hinge placement, temple/arm design, nose pads, material finish, color, transparency, and visible branding
- real proportions and perspective; do not stretch, slim, thicken, mirror incorrectly, or redesign any part

Studio requirements:
- isolated product on a clean pure-white seamless background
- full product visible, centered, sharp, realistic, and marketplace-ready
- zoom out enough to leave at least 12% clean white safe margin on all four sides
- every outermost product edge, including both hinge tips and the full temple/ear bends, must remain inside the canvas; never let the product touch or cross a canvas edge
- soft commercial studio lighting with natural reflections and a subtle contact shadow
- no props, hands, face, packaging, case, labels, watermarks, extra text, fake logos, added decorations, invented screws, patterns, or lens tint changes

If references conflict, prioritize the role-specific reference for the requested view, then use the other references only to preserve structure and details.`;

function ecommercePrompt(outputTitle, instructions) {
  return `${ecommerceBasePrompt}

Output: ${outputTitle}.
${instructions}`.trim();
}

const defaults = Object.freeze([
  {
    id: "gallery-front",
    label: "Front Studio Shot",
    role: "front",
    category: "gallery",
    fileSuffix: "front",
    text: ecommercePrompt(
      "Front Studio Shot",
      `Show a true straight-on front view.
The frame must be horizontally level, symmetrical, and centered.
Keep both lenses the same size and shape as the reference.
Temple arms may be minimally visible only if natural from this view.
Do not rotate the product, add a three-quarter angle, or crop any edge.`,
    ),
    metadata: {
      sentTo: "GeminiProvider.interactions.create() OR OpenAIProvider.images.edit()",
      provider: "Gemini or GPT image model",
      apiMethod: "images.edit (GPT) / interactions.create response_format=image (Gemini)",
      referenceImages: "Focused references for this role, usually front + angle",
      promptRole: "Defines the exact ecommerce output — the model generates a single image per prompt",
      outputFormat: "2048×2048 PNG (normalized with sharp)",
    },
  },
  {
    id: "gallery-side",
    label: "Side Studio Shot",
    role: "side",
    category: "gallery",
    fileSuffix: "side",
    text: ecommercePrompt(
      "Side Studio Shot",
      `Show a true side profile focused on the temple arm, hinge, ear bend, and side branding if present.
Keep the full temple length visible and do not shorten or invent the arm.
Preserve hinge hardware, arm thickness, curvature, color, finish, and any visible mark exactly.
The front rim should appear only as naturally visible from a side view.
Do not convert this into a front or 45-degree view.`,
    ),
    metadata: {
      sentTo: "GeminiProvider.interactions.create() OR OpenAIProvider.images.edit()",
      provider: "Gemini or GPT image model",
      apiMethod: "images.edit (GPT) / interactions.create response_format=image (Gemini)",
      referenceImages: "Focused references for this role, usually side + temple + angle",
      promptRole: "Defines the exact ecommerce output — the model generates a single image per prompt",
      outputFormat: "2048×2048 PNG (normalized with sharp)",
    },
  },
  {
    id: "gallery-angle",
    label: "45 Degree Studio Shot",
    role: "angle",
    category: "gallery",
    fileSuffix: "angle",
    text: ecommercePrompt(
      "45 Degree Studio Shot",
      `Show a precise three-quarter 45-degree view.
Both the front frame and one temple arm must be visible with natural perspective.
Preserve lens geometry and bridge shape; do not warp the frame or make the temples asymmetrical.
Keep the product centered, fully visible, and level.
Do not add dramatic angles, props, text, or lifestyle styling.`,
    ),
    metadata: {
      sentTo: "GeminiProvider.interactions.create() OR OpenAIProvider.images.edit()",
      provider: "Gemini or GPT image model",
      apiMethod: "images.edit (GPT) / interactions.create response_format=image (Gemini)",
      referenceImages: "Focused references for this role, usually angle + front",
      promptRole: "Defines the exact ecommerce output — the model generates a single image per prompt",
      outputFormat: "2048×2048 PNG (normalized with sharp)",
    },
  },
  {
    id: "gallery-hero",
    label: "Premium Ecommerce Hero Image",
    role: "hero",
    category: "gallery",
    fileSuffix: "hero",
    text: ecommercePrompt(
      "Premium Ecommerce Hero Image",
      `Create a polished marketplace hero product image, preferably a refined three-quarter presentation.
Use generous spacing, balanced composition, clean white background, subtle shadow, and premium optical-store lighting.
Keep the product accurate and fully visible; do not create a lifestyle ad, campaign poster, brand graphic, or Instagram layout.
Do not add price, SKU, logo overlays, captions, decorative elements, props, or background textures.`,
    ),
    metadata: {
      sentTo: "GeminiProvider.interactions.create() OR OpenAIProvider.images.edit()",
      provider: "Gemini or GPT image model",
      apiMethod: "images.edit (GPT) / interactions.create response_format=image (Gemini)",
      referenceImages: "Focused references for this role, usually front + angle",
      promptRole: "Defines the exact ecommerce output — the model generates a single image per prompt",
      outputFormat: "2048×2048 PNG (normalized with sharp)",
    },
  },
  {
    id: "price-label",
    label: "Instagram Price Label Insertion",
    role: null,
    category: "price-label",
    fileSuffix: null,
    text: `Edit the target image by adding only the price text "${"${price}"}".

Use the provided price-label reference as the exact visual specification:
- same label position, size, alignment, typography, color, shape, stroke, shadow, spacing, and graphical treatment
- if the reference contains an old price or placeholder, replace it with exactly "${"${price}"}"

Strict preservation rules:
- do not change the product, background, logo, footer, layout, lighting, colors, shadows, crop, dimensions, or composition
- Do not add the SKU, captions, badges, stickers, icons, decorative elements, extra words, or any text other than the supplied price
- do not improve, restyle, regenerate, or retouch the image

Return the same image with only the price label added in the reference style.`,
    metadata: {
      sentTo: "PriceLabelEditService → OpenAI client.images.edit()",
      provider: "GPT only (configured OpenAI image model)",
      apiMethod: "images.edit - model edits the composed Instagram image by adding the price label",
      referenceImages: "Composed Instagram image (background + product + logo + footer) + price-label-reference.png",
      promptRole: "Instructs the model where and how to place the price text — uses the reference image for exact style matching",
      outputFormat: "Profile dimensions (e.g. 1080×1350) PNG (normalized with sharp)",
    },
  },
]);

export async function getAllPrompts() {
  const saved = await readPrompts();
  const merged = defaults.map((defaultPrompt) => {
    const savedPrompt = saved?.find((p) => p.id === defaultPrompt.id);
    return {
      ...defaultPrompt,
      defaultText: defaultPrompt.text,
      text: savedPrompt?.text ?? defaultPrompt.text,
      updatedAt: savedPrompt?.updatedAt ?? null,
    };
  });
  return merged;
}

export async function getPrompt(promptId) {
  const all = await getAllPrompts();
  const prompt = all.find((p) => p.id === promptId);
  if (!prompt) {
    throw new AppError(`Prompt "${promptId}" not found.`, 404);
  }
  return prompt;
}

export async function updatePrompts(updates) {
  const saved = await readPrompts();
  const now = new Date().toISOString();
  const merged = [...(saved || [])];

  for (const update of updates) {
    const defaultPrompt = defaults.find((d) => d.id === update.id);
    if (!defaultPrompt) {
      throw new AppError(`Unknown prompt id "${update.id}".`, 400);
    }
    if (!update.text || typeof update.text !== "string" || update.text.trim().length === 0) {
      throw new AppError(`Prompt "${update.id}" text cannot be empty.`, 400);
    }

    const existingIndex = merged.findIndex((p) => p.id === update.id);
    const entry = { id: update.id, text: update.text.trim(), updatedAt: now };
    if (existingIndex >= 0) {
      merged[existingIndex] = entry;
    } else {
      merged.push(entry);
    }
  }

  await writeFileEnsured(promptsPath, Buffer.from(JSON.stringify(merged, null, 2) + "\n"));
  return getAllPrompts();
}

export async function resetPrompts() {
  await writeFileEnsured(
    promptsPath,
    Buffer.from(JSON.stringify(defaults.map((d) => ({ id: d.id, text: d.text, updatedAt: null })), null, 2) + "\n"),
  );
  return getAllPrompts();
}

export function getDefaultPrompts() {
  return defaults.map((prompt) => ({ ...prompt }));
}

async function readPrompts() {
  try {
    const content = await fs.readFile(promptsPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new AppError("Saved prompts file is not valid JSON.", 500);
    }
    throw error;
  }
}
