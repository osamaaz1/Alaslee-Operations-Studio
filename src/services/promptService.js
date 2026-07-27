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
- isolated product on a seamless solid pure-white (#FFFFFF) background with neutral studio lighting; no yellow, cream, beige, gray, gradients, or warm color cast
- keep the eyeglasses sharp, vibrant, correctly exposed, and faithful to the real colors and details; never faded, hazy, dull, or washed out
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

function dynamicAdPrompt(id, label, text) {
  return {
    id,
    label,
    role: "dynamic-ad",
    category: "dynamic-ad",
    fileSuffix: id.replace(/^dynamic-/, "dynamic-"),
    text: text.trim(),
    metadata: {
      sentTo: "GeminiProvider or OpenAIProvider",
      provider: "Gemini or GPT image model",
      apiMethod: "Single reference-driven image generation/edit request",
      referenceImages: "All available product references",
      promptRole: "Creates one premium creative advertisement in the selected format",
      outputFormat: "1080×1080 square or 1080×1920 portrait PNG",
    },
  };
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
    id: "gallery-model",
    label: "Real Person Wearing the Eyeglasses",
    role: "model",
    category: "gallery",
    fileSuffix: "model",
    text: `Create exactly one photorealistic premium eyewear portrait for a Saudi optical-store audience.

Use the uploaded product references as the absolute source of truth for the eyeglasses. Preserve exactly the real frame geometry, lens shape and size, bridge, rims, hinges, temple arms, nose pads, color, transparency, finish, proportions, lens tint, and visible branding. Do not redesign, simplify, mirror, thicken, recolor, or invent any product detail.

Show one real adult person naturally wearing the exact eyeglasses in a close head-and-shoulders portrait. The face must have realistic human skin, eyes, hair, proportions, texture, and photographic detail; never create an illustration, mannequin, doll, CGI character, beauty drawing, or visibly synthetic face. Use a natural three-quarter or near-front pose so both the person's face and the eyeglasses are clear, sharp, level, unobstructed, and large enough to inspect.

Use modest, contemporary clothing and respectful styling suitable for customers in Saudi Arabia. Traditional Saudi clothing is allowed but not required. Keep the expression natural and professional, the lighting soft and commercial, and the background clean and neutral. Do not add text, price, SKU, badges, watermarks, extra glasses, props covering the frame, hands touching the glasses, or unrelated logos.

The runtime gender instruction appended to this prompt is mandatory. Return exactly one square ecommerce image.`,
    metadata: {
      sentTo: "GeminiProvider.interactions.create() OR OpenAIProvider.images.edit()",
      provider: "Gemini or GPT image model",
      apiMethod: "images.edit (GPT) / interactions.create response_format=image (Gemini)",
      referenceImages: "Front + angle + side references for exact eyewear preservation",
      promptRole: "Creates the optional fourth close portrait using the selected adult model gender",
      outputFormat: "2048×2048 PNG (normalized with sharp)",
    },
  },
  dynamicAdPrompt(
    "dynamic-hand",
    "Creative Ad — Eyeglasses in Hand",
    `Create exactly one photorealistic premium eyewear advertising photograph.

Show the exact eyeglasses held naturally and confidently by one elegant adult hand. Use a refined gesture that supports the frame at a safe point such as the bridge or one temple without covering the lenses, hinges, important construction details, or any genuine visible mark. Keep the eyeglasses as the unmistakable hero of the image and make them tack-sharp, correctly exposed, and large enough to inspect.

Use sophisticated commercial lighting, realistic skin texture, anatomically correct fingers and joints, and a shallow professional depth of field. The result should feel like an original campaign photographed for a leading international eyewear house: restrained, distinctive, luxurious, contemporary, and believable. Do not show malformed fingers, extra fingers, duplicated hands, a distracting face, or casual phone-photo styling.`,
  ),
  dynamicAdPrompt(
    "dynamic-decor",
    "Creative Ad — Identity-Inspired Decor",
    `Create exactly one photorealistic premium eyewear advertising still life.

Place the exact eyeglasses as the sharp hero object within a restrained, art-directed set of sculptural props and refined surfaces. Derive the palette, materials, finish, and visual mood only from colors, textures, materials, and genuine brand details that are clearly observable in the supplied product references. If those references do not establish a reliable brand identity, use a neutral luxury palette that harmonizes with the real frame instead of guessing official brand colors or motifs.

Use balanced negative space, precise commercial lighting, realistic contact shadows and reflections, and a polished editorial composition associated with leading international eyewear campaigns. Keep every prop secondary to the glasses. Avoid clutter, invented brand patterns, unrelated packaging, flowers covering the product, or generic marketplace styling.`,
  ),
  dynamicAdPrompt(
    "dynamic-person-cafe",
    "Creative Ad — Modern Cafe",
    `Create exactly one photorealistic premium lifestyle eyewear advertisement.

Show one real adult person of the required gender naturally wearing the exact eyeglasses in an upscale contemporary cafe. Use modest, fashion-forward clothing, a relaxed professional expression, elegant posture, soft natural window light, and subtle editorial styling. Keep the full visible front of the glasses and the person's face clear, realistic, and tack-sharp while tables, architecture, people, and other background details fall into a smooth optical blur.

The photograph must look art-directed by a professional fashion photographer for a leading international eyewear campaign, never like a casual snapshot, influencer selfie, stock photo, or synthetic beauty render.`,
  ),
  dynamicAdPrompt(
    "dynamic-person-classic-street",
    "Creative Ad — Classic Street",
    `Create exactly one photorealistic premium lifestyle eyewear advertisement.

Show one real adult person of the required gender naturally wearing the exact eyeglasses on a refined classic urban street with timeless architecture and understated character. Use elegant, modest, contemporary-classic styling, confident natural posture, and cinematic daylight. Keep the full visible front of the glasses and the person's face clear, realistic, and tack-sharp while the street, architecture, traffic, signs, and passersby remain softly blurred and visually secondary.

The result should feel timeless and globally editorial, photographed by a specialist eyewear campaign photographer. Avoid tourist clichés, readable shop signs, street-brand logos, exaggerated poses, or ordinary phone photography.`,
  ),
  dynamicAdPrompt(
    "dynamic-person-formal-modern",
    "Creative Ad — Modern Formal",
    `Create exactly one photorealistic premium lifestyle eyewear advertisement.

Show one real adult person of the required gender naturally wearing the exact eyeglasses in a polished modern formal setting. Use modest contemporary tailoring, a composed but approachable expression, confident posture, architectural or studio-quality surroundings, and precise soft commercial light. Keep the full visible front of the glasses and the person's face clear, realistic, and tack-sharp while the environment falls into a controlled professional blur.

The image should communicate quiet authority and modern luxury at the level of a leading international eyewear campaign. Avoid stiff corporate stock-photo poses, excessive jewelry, visible third-party branding, or artificial-looking skin.`,
  ),
  dynamicAdPrompt(
    "dynamic-person-saudi-modern",
    "Creative Ad — Modern Saudi",
    `Create exactly one photorealistic premium lifestyle eyewear advertisement for a Saudi audience.

Show one real adult person of the required gender naturally wearing the exact eyeglasses with culturally respectful, modest, contemporary Saudi styling. Use an elegant modern Saudi interior or architectural setting, confident natural posture, authentic details, and sophisticated commercial light. Keep the full visible front of the glasses and the person's face clear, realistic, and tack-sharp while the environment remains softly blurred and secondary.

Make the result distinctive, aspirational, and globally editorial without turning Saudi identity into a costume or stereotype. Avoid theatrical poses, cultural caricatures, excessive luxury clichés, unrelated logos, or casual phone-photo styling.`,
  ),
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
