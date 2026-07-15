import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GeminiProvider } from "../src/providers/GeminiProvider.js";

const output = {
  role: "front",
  fileSuffix: "front",
  label: "Front",
  prompt: "Create a clean product image.",
};

test("Gemini Agent Platform uses generateContent and returns inline image data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-gemini-agent-"));
  try {
    const referencePath = path.join(root, "reference.png");
    await fs.writeFile(referencePath, Buffer.from("reference"));
    let request;
    const client = {
      models: {
        generateContent: async (input) => {
          request = input;
          return { candidates: [{ content: { parts: [{ text: "done" }, { inlineData: { data: Buffer.from("agent-image").toString("base64"), mimeType: "image/png" } }] } }] };
        },
      },
    };
    const provider = new GeminiProvider({ apiKey: "test", apiMode: "agent-platform", model: "gemini-test", client });
    const started = []; const completed = [];
    const [result] = await provider.generateImages({
      originalImages: [{ path: referencePath, mimeType: "image/png" }], outputs: [output],
      onImageStarted: async (role) => started.push(role),
      onImageGenerated: async (image) => completed.push(image.role),
    });

    assert.equal(request.model, "gemini-test");
    assert.deepEqual(request.config.responseModalities, ["TEXT", "IMAGE"]);
    assert.equal(request.contents[0].parts[0].text, output.prompt);
    assert.equal(request.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(result.buffer.toString(), "agent-image");
    assert.equal(result.mimeType, "image/png");
    assert.deepEqual(started, ["front"]);
    assert.deepEqual(completed, ["front"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Gemini Developer API keeps using the interactions image endpoint", async () => {
  let request;
  const client = {
    interactions: {
      create: async (input) => {
        request = input;
        return { output_image: { data: Buffer.from("developer-image").toString("base64") } };
      },
    },
  };
  const provider = new GeminiProvider({ apiKey: "test", apiMode: "developer", model: "gemini-test", client });
  const [result] = await provider.generateImages({ originalImages: [], outputs: [output] });

  assert.equal(request.model, "gemini-test");
  assert.equal(request.input[0].text, output.prompt);
  assert.equal(request.response_format.type, "image");
  assert.equal(result.buffer.toString(), "developer-image");
  assert.equal(result.mimeType, "image/jpeg");
});
