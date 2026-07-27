// Defines and validates the two single-product generation experiences.

import { AppError } from "../utils/errors.js";

export const GENERATION_MODES = Object.freeze({
  GALLERY: "gallery",
  DYNAMIC_AD: "dynamic-ad",
});

export const DYNAMIC_AD_ROLE = "dynamic-ad";
export const GALLERY_ROLES = Object.freeze(["front", "side", "angle", "model"]);

export const DYNAMIC_AD_FORMATS = Object.freeze({
  square: Object.freeze({
    id: "square",
    aspectRatio: "1:1",
    outputWidth: 1080,
    outputHeight: 1080,
    openAiRequestSize: "1088x1088",
  }),
  portrait: Object.freeze({
    id: "portrait",
    aspectRatio: "9:16",
    outputWidth: 1080,
    outputHeight: 1920,
    openAiRequestSize: "1152x2048",
  }),
});

export const DYNAMIC_AD_STYLES = Object.freeze(["hand", "decor", "person"]);
export const DYNAMIC_AD_SCENES = Object.freeze([
  "cafe",
  "classic-street",
  "formal-modern",
  "saudi-modern",
]);

export function normalizeGenerationSettings(options = {}) {
  const generationMode = optionalValue(options.generationMode) || GENERATION_MODES.GALLERY;
  if (!Object.values(GENERATION_MODES).includes(generationMode)) {
    throw new AppError('generationMode must be "gallery" or "dynamic-ad".', 422, {
      code: "generation_mode_invalid",
    });
  }

  if (generationMode === GENERATION_MODES.GALLERY) {
    return {
      generationMode,
      includeModel: options.includeModel !== false,
      modelGender: optionalValue(options.modelGender),
      outputFormat: null,
      creativeStyle: null,
      lifestyleScene: null,
    };
  }

  const outputFormat = requiredEnum(
    options.outputFormat,
    Object.keys(DYNAMIC_AD_FORMATS),
    "اختر شكل الصورة: شاشة مربعة أو شاشة طولية.",
    "dynamic_output_format_required",
  );
  const creativeStyle = requiredEnum(
    options.creativeStyle,
    DYNAMIC_AD_STYLES,
    "اختر أسلوب الإعلان الإبداعي قبل بدء التوليد.",
    "dynamic_creative_style_required",
  );

  const suppliedScene = optionalValue(options.lifestyleScene);
  const suppliedGender = optionalValue(options.modelGender);
  if (creativeStyle !== "person" && (suppliedScene || suppliedGender)) {
    throw new AppError("خيارات الشخص والمشهد متاحة فقط عند اختيار شخص يرتدي النظارة.", 422, {
      code: "dynamic_person_options_not_applicable",
    });
  }

  let lifestyleScene = null;
  let modelGender = null;
  if (creativeStyle === "person") {
    lifestyleScene = requiredEnum(
      suppliedScene,
      DYNAMIC_AD_SCENES,
      "اختر مشهد الشخص قبل بدء التوليد.",
      "dynamic_lifestyle_scene_required",
    );
    modelGender = requiredEnum(
      suppliedGender,
      ["male", "female"],
      "اختر هل الشخص رجل أم امرأة قبل بدء التوليد.",
      "dynamic_person_gender_required",
    );
  }

  return {
    generationMode,
    includeModel: false,
    modelGender,
    outputFormat,
    creativeStyle,
    lifestyleScene,
  };
}

export function getDynamicAdFormat(formatId) {
  const format = DYNAMIC_AD_FORMATS[String(formatId || "")];
  if (!format) {
    throw new AppError("اختر شكل الصورة: شاشة مربعة أو شاشة طولية.", 422, {
      code: "dynamic_output_format_required",
    });
  }
  return format;
}

function requiredEnum(value, allowed, message, code) {
  const normalized = optionalValue(value);
  if (!normalized || !allowed.includes(normalized)) {
    throw new AppError(message, 422, { code });
  }
  return normalized;
}

function optionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
