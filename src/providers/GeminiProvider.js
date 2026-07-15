import fs from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./AIProvider.js";
import { AppError } from "../utils/errors.js";
import { withProviderRetry } from "../utils/retry.js";

export class GeminiProvider extends AIProvider {
  constructor({ apiKey, model, apiMode = "developer", client }) {
    super({ name: "gemini", model });
    if (!apiKey) {
      throw new AppError("GEMINI_API_KEY is required when AI_PROVIDER=gemini.", 500);
    }
    if (!new Set(["developer", "agent-platform"]).has(apiMode)) {
      throw new AppError('GEMINI_API_MODE must be "developer" or "agent-platform".', 500);
    }

    this.apiMode = apiMode;
    this.client = client || new GoogleGenAI(apiMode === "agent-platform" ? { enterprise: true, apiKey } : { apiKey });
  }

  async generateImages({ originalImages, outputs, onImageStarted, onImageGenerated }) {
    const referenceParts = await this.#buildReferenceParts(originalImages);
    const results = [];

    for (const output of outputs) {
      if (onImageStarted) await onImageStarted(output.role);
      const startedAt = Date.now();
      const image = this.apiMode === "agent-platform"
        ? await this.#generateWithAgentPlatform(output, referenceParts)
        : await this.#generateWithDeveloperApi(output, referenceParts);
      if (!image?.data) {
        throw new AppError(`Gemini did not return image data for ${output.role}.`, 502);
      }

      const generated = {
        role: output.role,
        fileSuffix: output.fileSuffix,
        label: output.label,
        prompt: output.prompt,
        provider: this.name,
        model: this.model,
        buffer: Buffer.from(image.data, "base64"),
        mimeType: image.mimeType,
        generationDurationMs: Date.now() - startedAt,
      };
      if (onImageGenerated) await onImageGenerated(generated);
      results.push(generated);
    }

    return results;
  }

  async #buildReferenceParts(originalImages) {
    return Promise.all(
      originalImages.map(async (image) => {
        const data = (await fs.readFile(image.path)).toString("base64");
        return this.apiMode === "agent-platform"
          ? { inlineData: { data, mimeType: image.mimeType } }
          : { type: "image", data, mime_type: image.mimeType };
      }),
    );
  }

  async #generateWithDeveloperApi(output, referenceParts) {
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
    return image ? { data: image.data, mimeType: image.mime_type || image.mimeType || "image/jpeg" } : null;
  }

  async #generateWithAgentPlatform(output, referenceParts) {
    const response = await withProviderRetry(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: output.prompt }, ...referenceParts] }],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "1:1", imageSize: "2K" },
        },
      }),
    );
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    if (!image) return null;
    return {
      data: image.inlineData?.data || image.inline_data?.data,
      mimeType: image.inlineData?.mimeType || image.inline_data?.mime_type || "image/png",
    };
  }
}
