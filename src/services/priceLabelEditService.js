// Adds only the requested price label to a composed Instagram image with OpenAI.

import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { withProviderRetry } from "../utils/retry.js";
import { getAllPrompts } from "./promptService.js";

export class PriceLabelEditService {
  constructor() {
    assertPriceLabelEditorConfigured();

    this.provider = "openai";
    this.model = config.openai.priceLabelModel;
    assertSupportedPriceLabelModel(this.model);
    this.timeoutMs = config.openai.requestTimeoutMs;
    this.imageQuality = config.openai.imageQuality;
    this.client = new OpenAI({ apiKey: config.openai.apiKey, timeout: this.timeoutMs });
  }

  async addPriceLabel({ composedPath, referencePath, price, dimensions }) {
    const promptText = await loadPriceLabelPrompt(price);
    const image = await Promise.all([
      toFile(fs.createReadStream(composedPath), "target-composed.png", { type: "image/png" }),
      toFile(fs.createReadStream(referencePath), "price-label-reference.png", { type: "image/png" }),
    ]);
    const request = editRequest(this.model, image, promptText, dimensions);
    if (!this.model.startsWith("gpt-image-2")) {
      request.input_fidelity = "high";
    }

    const response = await withProviderRetry(
      () =>
        this.client.images.edit(request, {
          timeout: this.timeoutMs,
        }),
      { attempts: 1 },
    );

    const base64 = response?.data?.[0]?.b64_json;
    if (!base64) {
      throw new AppError("OpenAI did not return image data for price-label insertion.", 502);
    }

    return {
      buffer: Buffer.from(base64, "base64"),
      model: this.model,
      provider: this.provider,
      prompt: promptText,
    };
  }
}

export function getPriceLabelEditorStatus() {
  return {
    provider: "openai",
    model: config.openai.priceLabelModel,
    configured: Boolean(config.openai.apiKey) && supportedPriceLabelModel(config.openai.priceLabelModel),
    modelSupported: supportedPriceLabelModel(config.openai.priceLabelModel),
  };
}

export function assertPriceLabelEditorConfigured() {
  if (!config.openai.apiKey) {
    throw new AppError("OPENAI_API_KEY is required for Instagram price-label insertion.", 500);
  }
}

function assertSupportedPriceLabelModel(model) {
  if (!supportedPriceLabelModel(model)) {
    throw new AppError("Price-label insertion requires a GPT image model that supports multiple input images.", 500);
  }
}

function supportedPriceLabelModel(model) {
  return String(model).startsWith("gpt-image-");
}

function editRequest(model, image, prompt, dimensions) {
  return {
    model,
    image,
    prompt,
    n: 1,
    size: editSize(model, dimensions),
    quality: "high",
    output_format: "png",
  };
}

async function loadPriceLabelPrompt(price) {
  try {
    const prompts = await getAllPrompts();
    const priceLabelPrompt = prompts.find((p) => p.id === "price-label");
    if (priceLabelPrompt?.text) {
      return priceLabelPrompt.text.replace("${price}", price);
    }
  } catch {
    // fall through to default
  }
  return defaultPriceLabelPrompt(price);
}


function editSize(model, dimensions) {
  const requested = `${dimensions.width}x${dimensions.height}`;
  const modelName = String(model);

  if (modelName.startsWith("gpt-image-2")) {
    return dimensions.width % 16 === 0 && dimensions.height % 16 === 0 ? requested : "auto";
  }

  return legacyEditSizes.has(requested) ? requested : "auto";
}

const legacyEditSizes = new Set(["1024x1024", "1024x1536", "1536x1024"]);

function defaultPriceLabelPrompt(price) {
  return `
Edit the target image by adding only the price text "${price}".

Use the provided price-label reference as the exact visual specification:
- same label position, size, alignment, typography, color, shape, stroke, shadow, spacing, and graphical treatment
- if the reference contains an old price or placeholder, replace it with exactly "${price}"

Strict preservation rules:
- do not change the product, background, logo, footer, layout, lighting, colors, shadows, crop, dimensions, or composition
- Do not add the SKU, captions, badges, stickers, icons, decorative elements, extra words, or any text other than the supplied price
- do not improve, restyle, regenerate, or retouch the image

Return the same image with only the price label added in the reference style.
`.trim();
}
