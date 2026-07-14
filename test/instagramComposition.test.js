import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { composeInstagramImage } from "../src/services/instagramCompositionService.js";
import { compositionDefaults } from "../src/services/compositionSettingsService.js";

test("landscape product containment does not introduce opaque black padding", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-composition-"));
  try {
    const background = path.join(root, "background.png");
    const logo = path.join(root, "logo.png");
    const footer = path.join(root, "footer.png");
    await sharp({ create: { width: 400, height: 400, channels: 3, background: "white" } }).png().toFile(background);
    await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toFile(logo);
    await sharp({ create: { width: 200, height: 20, channels: 4, background: { r: 220, g: 220, b: 220, alpha: 1 } } }).png().toFile(footer);
    const product = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="white"/><path d="M100 100h400" stroke="black" stroke-width="30"/></svg>`)).png().toBuffer();
    const result = await composeInstagramImage(product, { background, logo, footer }, { ...compositionDefaults, shadowEnabled: false }, { width: 400, height: 400 });
    const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (80 * info.width + 200) * info.channels;
    assert.ok(data[pixel] > 220 && data[pixel + 1] > 220 && data[pixel + 2] > 220);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
