import fs from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./AIProvider.js";
import { AppError } from "../utils/errors.js";
import { withProviderRetry } from "../utils/retry.js";

export class GeminiProvider extends AIProvider {
  constructor({ apiKey, model }) {
    super({ name: "gemini", model });
    if (!apiKey) {
      throw new AppError("GEMINI_API_KEY is required when AI_PROVIDER=gemini.", 500);
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async generateImages({ originalImages, outputs }) {
    const referenceParts = await this.#buildReferenceParts(originalImages);
    const results = [];

    for (const output of outputs) {
      const interaction = await withProviderRetry(() =>
        this.client.interactions.create({
          model: this.model,
          input: [{ type: "text", text: output.prompt }, ...referenceParts],
          response_format: {
            type: "image",
            mime_type: "image/jpeg",
            aspect_ratio: "1:1",
            image_size: "2K",
          },
        }),
      );

      const image = interaction?.output_image ?? interaction?.outputImage;
      if (!image?.data) {
        throw new AppError(`Gemini did not return image data for ${output.role}.`, 502);
      }

      results.push({
        role: output.role,
        fileSuffix: output.fileSuffix,
        label: output.label,
        prompt: output.prompt,
        provider: this.name,
        model: this.model,
        buffer: Buffer.from(image.data, "base64"),
      });
    }

    return results;
  }

  async #buildReferenceParts(originalImages) {
    return Promise.all(
      originalImages.map(async (image) => ({
        type: "image",
        data: (await fs.readFile(image.path)).toString("base64"),
        mime_type: image.mimeType,
      })),
    );
  }
}
