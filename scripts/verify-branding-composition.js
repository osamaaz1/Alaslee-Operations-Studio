// Renders all supported brand layouts with the real supplied assets for visual release review.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "../src/config.js";
import { compositionDefaults, compositionFormats } from "../src/services/compositionSettingsService.js";
import { composeInstagramImage } from "../src/services/instagramCompositionService.js";

const diagnostics = path.join(config.rootDir, "diagnostics", "branding");
await fs.mkdir(diagnostics, { recursive: true });
const sample = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
  <rect width="1200" height="700" fill="white"/>
  <g fill="none" stroke="#171717" stroke-width="34" stroke-linejoin="round">
    <path d="M115 245 Q285 160 485 235 L455 455 Q270 535 135 410 Z"/>
    <path d="M1085 245 Q915 160 715 235 L745 455 Q930 535 1065 410 Z"/>
    <path d="M485 255 Q600 205 715 255"/>
    <path d="M120 260 L25 205 M1080 260 L1175 205"/>
  </g>
</svg>`)).png().toBuffer();

const assets = {
  background: config.branding.backgroundPath,
  logo: config.branding.logoPath,
  footer: config.branding.footerPath,
};
const outputs = [];
for (const format of Object.values(compositionFormats)) {
  const result = await composeInstagramImage(sample, assets, compositionDefaults, format);
  const outputPath = path.join(diagnostics, `${format.id}.png`);
  await fs.writeFile(outputPath, result.buffer);
  const stats = await sharp(result.buffer).stats();
  const entropy = stats.entropy;
  if (result.width !== format.width || result.height !== format.height || entropy < 1) {
    throw new Error(`Brand composition validation failed for ${format.id}.`);
  }
  outputs.push({ format: format.id, width: result.width, height: result.height, entropy: Number(entropy.toFixed(3)), outputPath });
}
console.log(JSON.stringify({ ok: true, outputs }, null, 2));
