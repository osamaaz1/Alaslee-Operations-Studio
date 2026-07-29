// Defines the trusted brand-overlay asset catalog exposed to the production UI.

import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const assetRoot = path.join(config.rootDir, "assets", "brand-overlay");

const brandDefinitions = [
  ["armani-exchange", "Armani Exchange", "أرماني إكستشينج", "armani-exchange.svg"],
  ["arnette", "Arnette", "أرنيت", "arnette.svg"],
  ["calvin-klein", "Calvin Klein", "كالفن كلاين", "calvin-klein.svg"],
  ["carrera", "Carrera", "كاريرا", "carrera.svg"],
  ["cartier", "Cartier", "كارتييه", "cartier.svg"],
  ["chanel", "Chanel", "شانيل", "chanel.svg"],
  ["chopard", "Chopard", "شوبارد", "chopard.svg"],
  ["dior", "Dior", "ديور", "dior.svg"],
  ["fendi", "Fendi", "فندي", "fendi.svg"],
  ["fila", "Fila", "فيلا", "fila.svg"],
  ["giorgio-armani", "Giorgio Armani", "جورجيو أرماني", "giorgio-armani.svg"],
  ["gucci", "Gucci", "غوتشي", "gucci.svg"],
  ["hugo-boss", "Hugo Boss", "هيوغو بوس", "hugo-boss.svg"],
  ["lacoste", "Lacoste", "لاكوست", "lacoste.svg"],
  ["liu-jo", "Liu Jo", "ليو جو", "liu-jo.svg"],
  ["miu-miu", "Miu Miu", "ميو ميو", "miu-miu.svg"],
  ["nina-ricci", "Nina Ricci", "نينا ريتشي", "nina-ricci.svg"],
  ["police", "Police", "بوليس", "police.svg"],
  ["polo-ralph-lauren", "Polo Ralph Lauren", "بولو رالف لورين", "polo-ralph-lauren.svg"],
  ["prada", "Prada", "برادا", "prada.svg"],
  ["ray-ban", "Ray-Ban", "راي بان", "ray-ban.svg"],
  ["silhouette", "Silhouette", "سيلويت", "silhouette.svg"],
  ["tom-ford", "Tom Ford", "توم فورد", "tom-ford.png"],
  ["tommy-hilfiger", "Tommy Hilfiger", "تومي هيلفيغر", "tommy-hilfiger.svg"],
  ["tous", "Tous", "توس", "tous.svg"],
  ["versace", "Versace", "فيرساتشي", "versace.svg"],
  ["vogue", "Vogue", "فوغ", "vogue.svg"],
];

export const brandOverlayBrands = Object.freeze(brandDefinitions.map(([id, name, nameAr, filename]) => Object.freeze({
  id,
  name,
  nameAr,
  filename,
})));

export const brandOverlayTones = Object.freeze([
  { id: "auto", label: "تلقائي" },
  { id: "original", label: "الأصلي" },
  { id: "light", label: "فاتح" },
  { id: "dark", label: "داكن" },
]);

export const alasleeLogoVariants = Object.freeze([
  { id: "dark", label: "داكن", filename: "alaslee-dark.png" },
  { id: "golden", label: "ذهبي", filename: "alaslee-golden.png" },
  { id: "light", label: "فاتح", filename: "alaslee-light.png" },
]);

const brandMap = new Map(brandOverlayBrands.map((brand) => [brand.id, brand]));
const alasleeMap = new Map(alasleeLogoVariants.map((variant) => [variant.id, variant]));
const toneIds = new Set(brandOverlayTones.map((tone) => tone.id));

export function getBrandOverlayCatalog() {
  return {
    brands: brandOverlayBrands.map(({ filename, ...brand }) => ({
      ...brand,
      assetUrl: `/v1/brand-overlay/assets/brands/${brand.id}?tone=original`,
    })),
    tones: brandOverlayTones,
    alasleeVariants: alasleeLogoVariants.map(({ filename, ...variant }) => ({
      ...variant,
      assetUrl: `/v1/brand-overlay/assets/alaslee/${variant.id}`,
    })),
    defaultCtaText: "Available now\nOrder it",
    limits: { maximumItems: 50, maximumCtaLength: 80, maximumCtaLines: 2 },
  };
}

export function requireBrandDefinition(brandId) {
  const brand = brandMap.get(String(brandId || "").trim().toLowerCase());
  if (!brand) throw new AppError("اختر ماركة نظارة من القائمة المعتمدة.", 400);
  return brand;
}

export function requireAlasleeVariant(variantId) {
  const variant = alasleeMap.get(String(variantId || "").trim().toLowerCase());
  if (!variant) throw new AppError("اختر لون شعار الأصلي من الخيارات المعتمدة.", 400);
  return variant;
}

export function normalizeBrandTone(value, fallback = "auto") {
  const tone = String(value || fallback).trim().toLowerCase();
  if (!toneIds.has(tone)) {
    throw new AppError("لون شعار النظارة يجب أن يكون تلقائياً أو أصلياً أو فاتحاً أو داكناً.", 400);
  }
  return tone;
}

export function brandAssetPath(brandId) {
  return path.join(assetRoot, "brands", requireBrandDefinition(brandId).filename);
}

export function alasleeAssetPath(variantId) {
  return path.join(assetRoot, "system", requireAlasleeVariant(variantId).filename);
}

export function systemOverlayAssetPath(filename) {
  const allowed = new Set(["salla.svg", "tamara.svg", "madfu.svg", "approved-reference.png"]);
  if (!allowed.has(filename)) throw new AppError("ملف هوية غير معتمد.", 400);
  return path.join(assetRoot, "system", filename);
}
