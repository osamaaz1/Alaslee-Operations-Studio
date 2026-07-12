// Verifies editable prompt defaults used by gallery and price-label generation.

import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultPrompts } from "../src/services/promptService.js";
import { galleryOutputs } from "../src/prompts/galleryPrompts.js";

test("default prompts include all gallery roles and price-label insertion", () => {
  const prompts = getDefaultPrompts();
  const ids = prompts.map((prompt) => prompt.id);

  assert.deepEqual(ids, [
    "gallery-front",
    "gallery-side",
    "gallery-angle",
    "gallery-hero",
    "price-label",
  ]);
});

test("every dispatched gallery prompt enforces uncropped safe-area framing", () => {
  for (const output of galleryOutputs) {
    assert.match(output.prompt, /at least 12% clean background/i);
    assert.match(output.prompt, /Never return a close-up or cropped product/i);
  }
});

test("price-label prompt keeps a replaceable price token and blocks SKU text", () => {
  const prompt = getDefaultPrompts().find((item) => item.id === "price-label");

  assert.match(prompt.text, /\$\{price\}/);
  assert.match(prompt.text, /Do not add the SKU/);
});

