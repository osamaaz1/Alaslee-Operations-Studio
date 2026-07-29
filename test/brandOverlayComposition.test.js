import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { brandOverlayBrands } from "../src/domain/brandOverlayCatalog.js";
import { getBrandOverlayAsset, getSystemOverlayAsset } from "../src/services/brandOverlayAssetService.js";
import {
  composeBrandOverlay,
  normalizeBrandOverlayCta,
} from "../src/services/brandOverlayCompositionService.js";
import {
  brandOverlayDefaultLayout,
  effectiveBrandOverlayLayout,
  normalizeBrandOverlayLayout,
} from "../src/services/brandOverlaySettingsService.js";

test("the eyewear catalog exposes 27 usable transparent logo assets", async () => {
  assert.equal(brandOverlayBrands.length, 27);
  for (const brand of brandOverlayBrands) {
    const asset = await getBrandOverlayAsset(brand.id, "original");
    const raw = await sharp(asset.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    let transparent = 0;
    for (let index = 3; index < raw.data.length; index += raw.info.channels) {
      if (raw.data[index] > 8) visible += 1;
      if (raw.data[index] < 247) transparent += 1;
    }
    assert.equal(visible > 0, true, `${brand.id} should contain a visible mark`);
    assert.equal(transparent > 0, true, `${brand.id} should not retain a solid background`);
  }
  const salla = await getSystemOverlayAsset("salla.svg", "dark");
  assert.equal(salla.width / salla.height > 1.5, true, "the stacked Salla source should expose one logo variant");
});

test("native overlay composition preserves exact source dimensions and untouched corner pixels", async () => {
  const source = await sharp({
    create: {
      width: 640,
      height: 800,
      channels: 4,
      background: { r: 42, g: 97, b: 133, alpha: 1 },
    },
  }).png().toBuffer();
  const output = await composeBrandOverlay(source, {
    brandId: "tom-ford",
    brandTone: "auto",
    alasleeVariant: "golden",
    ctaText: "متوفر الآن\nاطلبه",
    layout: brandOverlayDefaultLayout,
  });
  assert.deepEqual({ width: output.width, height: output.height }, { width: 640, height: 800 });
  const pixel = await sharp(output.buffer).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...pixel.subarray(0, 3)], [42, 97, 133]);
  assert.equal(["original", "light", "dark"].includes(output.brandTone), true);
  assert.equal(output.ctaText, "متوفر الآن\nاطلبه");
});

test("layout normalization clamps the contract and applies only the per-brand logo override", () => {
  const globalLayout = normalizeBrandOverlayLayout(brandOverlayDefaultLayout);
  const customBrandLogo = { xPercent: 12.5, yPercent: 18.25, widthPercent: 22.75 };
  const effective = effectiveBrandOverlayLayout({
    globalLayout,
    brandOverrides: {
      "ray-ban": { brandLogo: customBrandLogo, defaultTone: "dark" },
    },
  }, "ray-ban");
  assert.deepEqual(effective.brandLogo, customBrandLogo);
  assert.deepEqual(effective.alasleeLogo, globalLayout.alasleeLogo);
  assert.equal(effective.brandDefaultTone, "dark");
  assert.throws(
    () => normalizeBrandOverlayLayout({ ...globalLayout, cta: { ...globalLayout.cta, widthPercent: 90 } }),
    /cta\.widthPercent/,
  );
  assert.equal(normalizeBrandOverlayCta("one\ntwo\nthree"), "one\ntwo");
  assert.throws(() => normalizeBrandOverlayCta("x".repeat(81)), /80/);
});
