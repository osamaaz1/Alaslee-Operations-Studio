// Verifies server-owned Instagram composition formats and validation.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compositionFormats,
  getCompositionFormat,
  normalizeCompositionSettings,
} from "../src/services/compositionSettingsService.js";

test("composition formats expose the supported Instagram output profiles", () => {
  assert.deepEqual(Object.keys(compositionFormats), [
    "portrait-4x5",
    "square-1x1",
    "story-9x16",
    "landscape-1.91x1",
  ]);
  assert.equal(getCompositionFormat("story-9x16").height, 1920);
});

test("composition settings reject out-of-range layout values", () => {
  assert.throws(
    () => normalizeCompositionSettings({ productWidthPercent: 140 }),
    /productWidthPercent must be between 50 and 110/,
  );
});

