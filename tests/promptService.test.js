// Verifies editable prompt defaults used by gallery, dynamic-ad, and price-label generation.

import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultPrompts } from "../src/services/promptService.js";
import { galleryOutputs, getGalleryOutputs } from "../src/prompts/galleryPrompts.js";
import { getDefaultDynamicAdOutput } from "../src/prompts/dynamicAdPrompts.js";

test("default prompts include gallery, dynamic advertising, and price-label prompts", () => {
  const prompts = getDefaultPrompts();
  const ids = prompts.map((prompt) => prompt.id);

  assert.deepEqual(ids, [
    "gallery-front",
    "gallery-side",
    "gallery-angle",
    "gallery-model",
    "dynamic-hand",
    "dynamic-decor",
    "dynamic-person-cafe",
    "dynamic-person-classic-street",
    "dynamic-person-formal-modern",
    "dynamic-person-saudi-modern",
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

test("product-only gallery prompts require neutral pure-white backgrounds", () => {
  for (const output of galleryOutputs.filter((item) => item.role !== "model")) {
    assert.match(output.prompt, /solid pure-white \(#FFFFFF\) background/i);
    assert.match(output.prompt, /no yellow, cream, beige, gray, gradients, or warm color cast/i);
    assert.match(output.prompt, /never faded, hazy, dull, or washed out/i);
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

test("dynamic hand and decor prompts create one exact premium product advertisement", () => {
  const hand = getDefaultDynamicAdOutput({
    outputFormat: "portrait",
    creativeStyle: "hand",
  });
  const decor = getDefaultDynamicAdOutput({
    outputFormat: "square",
    creativeStyle: "decor",
  });

  assert.equal(hand.role, "dynamic-ad");
  assert.equal(hand.aspectRatio, "9:16");
  assert.equal(hand.openAiRequestSize, "1152x2048");
  assert.deepEqual(hand.outputDimensions, { width: 1080, height: 1920 });
  assert.match(hand.prompt, /held naturally and confidently by one elegant adult hand/i);
  assert.match(hand.prompt, /Preserve exactly the real frame geometry/i);
  assert.match(hand.prompt, /Never reconstruct, enlarge, detach, repeat, or place a standalone advertising logo/i);
  assert.match(hand.prompt, /Add no prices, captions, slogans, badges, watermarks, fake logos, invented text/i);

  assert.equal(decor.aspectRatio, "1:1");
  assert.equal(decor.openAiRequestSize, "1088x1088");
  assert.deepEqual(decor.outputDimensions, { width: 1080, height: 1080 });
  assert.match(decor.prompt, /derive the palette, materials, finish, and visual mood only/i);
  assert.match(decor.prompt, /instead of guessing official brand colors or motifs/i);
});

test("every person scene appends the exact selected adult gender and professional focus rules", () => {
  const scenes = [
    ["cafe", /upscale contemporary cafe/i],
    ["classic-street", /refined classic urban street/i],
    ["formal-modern", /polished modern formal setting/i],
    ["saudi-modern", /culturally respectful, modest, contemporary Saudi styling/i],
  ];

  for (const [lifestyleScene, sceneText] of scenes) {
    const male = getDefaultDynamicAdOutput({
      outputFormat: "portrait",
      creativeStyle: "person",
      lifestyleScene,
      modelGender: "male",
    });
    const female = getDefaultDynamicAdOutput({
      outputFormat: "square",
      creativeStyle: "person",
      lifestyleScene,
      modelGender: "female",
    });

    assert.match(male.prompt, sceneText);
    assert.match(male.prompt, /show exactly one real adult man/i);
    assert.match(female.prompt, /show exactly one real adult woman/i);
    assert.match(female.prompt, /complete visible front frame and lenses inside the canvas/i);
    assert.match(female.prompt, /non-sexualized/i);
  }
});
