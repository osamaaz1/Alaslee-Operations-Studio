// Verifies editable prompt defaults used by gallery and price-label generation.

import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultPrompts } from "../src/services/promptService.js";
import { galleryOutputs, getGalleryOutputs } from "../src/prompts/galleryPrompts.js";

test("default prompts include all gallery roles and price-label insertion", () => {
  const prompts = getDefaultPrompts();
  const ids = prompts.map((prompt) => prompt.id);

  assert.deepEqual(ids, [
    "gallery-front",
    "gallery-side",
    "gallery-angle",
    "gallery-model",
    "price-label",
  ]);
});

test("every dispatched gallery prompt enforces uncropped safe-area framing", () => {
  for (const output of galleryOutputs) {
    if (output.role === "model") {
      assert.match(output.prompt, /real adult person/i);
      assert.match(output.prompt, /Saudi Arabia/i);
      assert.match(output.prompt, /Preserve every visible product detail exactly/i);
    } else {
      assert.match(output.prompt, /at least 12% clean background/i);
      assert.match(output.prompt, /Never return a close-up or cropped product/i);
    }
  }
});

test("price-label prompt keeps a replaceable price token and blocks SKU text", () => {
  const prompt = getDefaultPrompts().find((item) => item.id === "price-label");

  assert.match(prompt.text, /\$\{price\}/);
  assert.match(prompt.text, /Do not add the SKU/);
});

test("individual gallery can add a culturally respectful gender-specific real-person portrait", async () => {
  const male = await getGalleryOutputs({ includeModel: true, modelGender: "male" });
  const female = await getGalleryOutputs({ includeModel: true, modelGender: "female" });
  const productOnly = await getGalleryOutputs({ includeModel: false });

  assert.equal(male.length, 4);
  assert.equal(productOnly.length, 3);
  assert.match(male.find((item) => item.role === "model").prompt, /exactly one real adult man/i);
  assert.match(female.find((item) => item.role === "model").prompt, /exactly one real adult woman/i);
  assert.match(male.find((item) => item.role === "model").prompt, /respectful styling suitable for customers in Saudi Arabia/i);
});

