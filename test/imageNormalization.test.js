import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeGeneratedPng } from "../src/utils/imageValidation.js";

test("generated landscape images are contained on a square canvas without cropping", async () => {
  const source = await sharp({
    create: {
      width: 300,
      height: 100,
      channels: 3,
      background: { r: 220, g: 20, b: 20 },
    },
  })
    .png()
    .toBuffer();

  const result = await normalizeGeneratedPng(source, 300);
  const { data, info } = await sharp(result.buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(result.width, 300);
  assert.equal(result.height, 300);
  assert.equal(info.channels, 3);

  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };

  assert.deepEqual(pixel(150, 0), [255, 255, 255], "top padding should be white");
  assert.deepEqual(pixel(0, 150), [220, 20, 20], "the left source edge must survive");
  assert.deepEqual(pixel(299, 150), [220, 20, 20], "the right source edge must survive");
  assert.deepEqual(pixel(150, 299), [255, 255, 255], "bottom padding should be white");
});

test("generated portrait images are contained without cropping their top or bottom", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 300,
      channels: 3,
      background: { r: 20, g: 80, b: 220 },
    },
  })
    .png()
    .toBuffer();

  const result = await normalizeGeneratedPng(source, 300);
  const { data, info } = await sharp(result.buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };

  assert.deepEqual(pixel(0, 150), [255, 255, 255], "left padding should be white");
  assert.deepEqual(pixel(150, 0), [20, 80, 220], "the top source edge must survive");
  assert.deepEqual(pixel(150, 299), [20, 80, 220], "the bottom source edge must survive");
  assert.deepEqual(pixel(299, 150), [255, 255, 255], "right padding should be white");
});
