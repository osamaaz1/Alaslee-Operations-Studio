import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenAIProvider } from "../src/providers/OpenAIProvider.js";

const portraitOutput = {
  role: "dynamic-ad",
  fileSuffix: "dynamic-hand-portrait",
  label: "Premium Creative Advertisement",
  prompt: "Create one exact premium eyewear advertisement.",
  openAiRequestSize: "1152x2048",
  outputDimensions: { width: 1080, height: 1920 },
};

test("GPT Image 2 uses the selected dynamic request dimensions and propagates final dimensions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-openai-provider-"));
  try {
    const referencePath = path.join(root, "front.png");
    await fs.writeFile(referencePath, Buffer.from("reference"));
    let request;
    let requestOptions;
    const client = {
      images: {
        edit: async (input, options) => {
          request = input;
          requestOptions = options;
          return { data: [{ b64_json: Buffer.from("generated").toString("base64") }] };
        },
      },
    };
    const provider = new OpenAIProvider({
      apiKey: "test",
      model: "gpt-image-2",
      client,
    });

    const [result] = await provider.generateImages({
      productId: "product-1",
      originalImages: [{
        role: "front",
        path: referencePath,
        filename: "front.png",
        mimeType: "image/png",
      }],
      outputs: [portraitOutput],
      outputSize: 2048,
    });

    assert.equal(request.model, "gpt-image-2");
    assert.equal(request.size, "1152x2048");
    assert.equal(request.prompt, portraitOutput.prompt);
    assert.equal(request.output_format, "png");
    assert.equal("input_fidelity" in request, false);
    assert.equal(requestOptions.timeout > 0, true);
    assert.deepEqual(result.outputDimensions, { width: 1080, height: 1920 });
    assert.equal(result.buffer.toString(), "generated");
    assert.deepEqual(result.referenceRoles, ["front"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("older GPT image models reject custom dynamic-ad dimensions before a paid request", async () => {
  let called = false;
  const provider = new OpenAIProvider({
    apiKey: "test",
    model: "gpt-image-1",
    client: {
      images: {
        edit: async () => {
          called = true;
          return { data: [] };
        },
      },
    },
  });

  await assert.rejects(
    () => provider.generateImages({
      productId: "product-2",
      originalImages: [],
      outputs: [portraitOutput],
      outputSize: 2048,
    }),
    (error) => error.statusCode === 422
      && error.details?.code === "dynamic_ad_gpt_model_unsupported",
  );
  assert.equal(called, false);
});
