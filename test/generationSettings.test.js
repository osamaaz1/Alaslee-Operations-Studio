import test from "node:test";
import assert from "node:assert/strict";
import {
  DYNAMIC_AD_FORMATS,
  GENERATION_MODES,
  normalizeGenerationSettings,
} from "../src/domain/generationSettings.js";
import { referencesForOutputRole } from "../src/domain/outputReferencePlan.js";

test("gallery settings remain backward compatible", () => {
  assert.deepEqual(normalizeGenerationSettings({}), {
    generationMode: GENERATION_MODES.GALLERY,
    includeModel: true,
    modelGender: null,
    outputFormat: null,
    creativeStyle: null,
    lifestyleScene: null,
  });

  assert.equal(
    normalizeGenerationSettings({ generationMode: "gallery", includeModel: false }).includeModel,
    false,
  );
});

test("dynamic hand and decor accept both clear screen formats", () => {
  for (const outputFormat of Object.keys(DYNAMIC_AD_FORMATS)) {
    for (const creativeStyle of ["hand", "decor"]) {
      assert.deepEqual(normalizeGenerationSettings({
        generationMode: "dynamic-ad",
        outputFormat,
        creativeStyle,
      }), {
        generationMode: "dynamic-ad",
        includeModel: false,
        modelGender: null,
        outputFormat,
        creativeStyle,
        lifestyleScene: null,
      });
    }
  }
});

test("dynamic person accepts every scene with an explicit adult gender", () => {
  const scenes = ["cafe", "classic-street", "formal-modern", "saudi-modern"];
  for (const lifestyleScene of scenes) {
    for (const modelGender of ["male", "female"]) {
      const settings = normalizeGenerationSettings({
        generationMode: "dynamic-ad",
        outputFormat: "portrait",
        creativeStyle: "person",
        lifestyleScene,
        modelGender,
      });
      assert.equal(settings.lifestyleScene, lifestyleScene);
      assert.equal(settings.modelGender, modelGender);
    }
  }
});

test("dynamic settings reject missing, invalid, or inapplicable selections", () => {
  assertValidationCode(
    { generationMode: "video" },
    "generation_mode_invalid",
  );
  assertValidationCode(
    { generationMode: "dynamic-ad", creativeStyle: "hand" },
    "dynamic_output_format_required",
  );
  assertValidationCode(
    { generationMode: "dynamic-ad", outputFormat: "portrait" },
    "dynamic_creative_style_required",
  );
  assertValidationCode(
    { generationMode: "dynamic-ad", outputFormat: "wide", creativeStyle: "hand" },
    "dynamic_output_format_required",
  );
  assertValidationCode(
    {
      generationMode: "dynamic-ad",
      outputFormat: "square",
      creativeStyle: "hand",
      modelGender: "male",
    },
    "dynamic_person_options_not_applicable",
  );
  assertValidationCode(
    {
      generationMode: "dynamic-ad",
      outputFormat: "portrait",
      creativeStyle: "person",
      modelGender: "female",
    },
    "dynamic_lifestyle_scene_required",
  );
  assertValidationCode(
    {
      generationMode: "dynamic-ad",
      outputFormat: "portrait",
      creativeStyle: "person",
      lifestyleScene: "cafe",
    },
    "dynamic_person_gender_required",
  );
});

test("dynamic advertising uses every available product-fidelity reference including the temple", () => {
  const originals = ["front", "side", "angle", "temple"].map((role) => ({ role }));
  assert.deepEqual(
    referencesForOutputRole(originals, "dynamic-ad").map((image) => image.role),
    ["front", "side", "angle", "temple"],
  );
});

function assertValidationCode(input, code) {
  assert.throws(
    () => normalizeGenerationSettings(input),
    (error) => error.statusCode === 422 && error.details?.code === code,
  );
}
