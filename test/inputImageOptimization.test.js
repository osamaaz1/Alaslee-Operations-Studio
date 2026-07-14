import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { optimizeUploadedImage, validateUploadedImage } from "../src/utils/imageValidation.js";
import fs from "node:fs";

test("portrait 3:4 input becomes 1152x1536 without changing its ratio", async () => {
  const image = await preparedImage(3468, 4624);
  assert.equal(image.sourceWidth, 3468);
  assert.equal(image.sourceHeight, 4624);
  assert.equal(image.width, 1152);
  assert.equal(image.height, 1536);
  assert.equal(image.orientation, "portrait");
});

test("16:9 and 9:16 inputs use orientation-aware bounds without cropping", async () => {
  const landscape = await preparedImage(3840, 2160);
  const portrait = await preparedImage(2160, 3840);
  assert.deepEqual([landscape.width, landscape.height], [1536, 864]);
  assert.deepEqual([portrait.width, portrait.height], [864, 1536]);
  assert.equal(landscape.width / landscape.height, 16 / 9);
  assert.equal(portrait.width / portrait.height, 9 / 16);
});

test("small inputs are never enlarged", async () => {
  const image = await preparedImage(900, 1200);
  assert.deepEqual([image.width, image.height], [900, 1200]);
});

test("production UI explains landscape preference, supported ratios, previews, and cost comparison", () => {
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  const review = fs.readFileSync("client/src/features/production/GenerationCostEstimate.jsx", "utf8");
  assert.match(app, /يفضّل تصوير النظارة بصورة أفقية/);
  assert.match(app, /16:9 و9:16/);
  assert.match(review, /قبل التصغير/);
  assert.match(review, /بعد التصغير/);
  assert.match(review, /معاينة الصورة بعد التصغير/);
  assert.doesNotMatch(review, /provider !== "gpt"/);
  assert.match(review, /output-1\/estimate\$\{batchId \? "" :/);
  assert.match(review, /includeModel=/);
});

async function preparedImage(width, height) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 232, g: 228, b: 218 } } }).jpeg({ quality: 94 }).toBuffer();
  const validated = await validateUploadedImage({ buffer, size: buffer.length, originalname: "reference.jpg" }, "front", 30 * 1024 * 1024);
  return optimizeUploadedImage(validated);
}
