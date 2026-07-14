import fs from "node:fs/promises";
import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { AIProvider } from "./AIProvider.js";
import { AppError } from "../utils/errors.js";
import { withProviderRetry } from "../utils/retry.js";
import { referencesForOutputRole } from "../domain/outputReferencePlan.js";

export class OpenAIProvider extends AIProvider {
  constructor({ apiKey, model }) {
    super({ name: "gpt", model });
    if (!apiKey) {
      throw new AppError("OPENAI_API_KEY is required when AI_PROVIDER=gpt.", 500);
    }

    this.timeoutMs = config.openai.requestTimeoutMs;
    this.imageRequestSize = config.openai.imageRequestSize;
    this.imageQuality = config.openai.imageQuality;
    this.client = new OpenAI({ apiKey, timeout: this.timeoutMs });
  }

  async generateImages({ productId, originalImages, outputs, outputSize, onImageStarted, onImageGenerated }) {
    const results = [];

    for (const output of outputs) {
      if (onImageStarted) await onImageStarted(output.role);
      console.info(`[output-1:gpt] starting ${output.role} for product ${productId}`);
      const startedAt = Date.now();
      const sourceImages = referencesForOutputRole(originalImages, output.role);
      console.info(
        `[output-1:gpt] ${output.role} references: ${sourceImages.map((image) => image.role).join(", ")}`,
      );
      const references = await this.#buildReferences(sourceImages);
      const response = await withProviderRetry(
        () =>
          this.client.images.edit(this.#buildRequest(references, output.prompt, outputSize), {
            timeout: this.timeoutMs,
          }),
        { attempts: 1 },
      );

      const base64 = response?.data?.[0]?.b64_json;
      if (!base64) {
        throw new AppError(`OpenAI did not return image data for ${output.role}.`, 502);
      }
      console.info(`[output-1:gpt] completed ${output.role} in ${Math.round((Date.now() - startedAt) / 1000)}s`);

      const generated = {
        role: output.role,
        fileSuffix: output.fileSuffix,
        label: output.label,
        prompt: output.prompt,
        provider: this.name,
        model: this.model,
        buffer: Buffer.from(base64, "base64"),
        referenceRoles: sourceImages.map((image) => image.role),
        generationDurationMs: Date.now() - startedAt,
      };
      if (onImageGenerated) {
        await onImageGenerated(generated);
      }
      results.push(generated);
    }

    return results;
  }

  async #buildReferences(originalImages) {
    return Promise.all(
      originalImages.map(async (image) =>
        toFile(await fs.readFile(image.path), image.filename, {
          type: image.mimeType,
        }),
      ),
    );
  }

  #buildRequest(references, prompt, outputSize) {
    const request = {
      model: this.model,
      image: references,
      prompt,
      n: 1,
      size: this.#editSize(outputSize),
      quality: this.imageQuality,
      output_format: "png",
    };

    if (!this.model.startsWith("gpt-image-2")) {
      request.input_fidelity = "high";
    }

    return request;
  }

  #editSize(outputSize) {
    const configured = String(this.imageRequestSize || "").trim();
    if (configured) return configured;
    return `${outputSize}x${outputSize}`;
  }
}
