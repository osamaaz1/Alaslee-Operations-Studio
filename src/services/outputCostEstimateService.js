// Estimates GPT Output 1 cost before sending paid image requests.

import { config } from "../config.js";
import { galleryOutputs } from "../prompts/galleryPrompts.js";
import { getProductById, getProductRecord } from "./productService.js";
import { referencesForOutputRole } from "../domain/outputReferencePlan.js";
import { getCompositionFormat } from "./compositionSettingsService.js";
import { getAllPrompts } from "./promptService.js";
import { db } from "../db/database.js";
import { normalizeProviderName, isFreeTestProvider } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";

const pricingUsdPerMillion = Object.freeze({
  textInput: 5,
  imageInput: 8,
  imageOutput: 30,
});

const outputTokensByQuality = Object.freeze({
  low: 272,
  medium: 1056,
  high: 4160,
  auto: 1056,
});

const safetyMultiplier = 2.5;

export function estimateProductOutputOneCost(productId, options = {}) {
  const product = getProductById(productId);
  const outputs = options.includeModel === false ? galleryOutputs.filter((output) => output.role !== "model") : galleryOutputs;
  const estimate = estimateProduct(product, outputs);
  const beforeOptimization = estimateProduct(sourceDimensionProduct(product), outputs);

  return {
    provider: "gpt",
    stage: "output_1",
    quality: config.openai.imageQuality,
    requestSize: config.openai.imageRequestSize,
    pricingUsdPerMillion,
    ...estimate,
    optimizationComparison: optimizationComparison(product, beforeOptimization, estimate),
    note:
      "Estimate only. OpenAI bills final GPT image usage from model-side image/text tokens, so actual cost can differ.",
  };
}

export function estimateBatchOutputOneCost(products) {
  const perProduct = products.map((product) => estimateProductOutputOneCost(product.id, { includeModel: false }));
  const totals = perProduct.reduce(
    (sum, item) => ({
      requestCount: sum.requestCount + item.requestCount,
      textInputTokens: sum.textInputTokens + item.textInputTokens,
      imageInputTokens: sum.imageInputTokens + item.imageInputTokens,
      imageOutputTokens: sum.imageOutputTokens + item.imageOutputTokens,
      estimatedUsd: sum.estimatedUsd + item.estimatedUsd,
      safetyCeilingUsd: sum.safetyCeilingUsd + item.safetyCeilingUsd,
    }),
    {
      requestCount: 0,
      textInputTokens: 0,
      imageInputTokens: 0,
      imageOutputTokens: 0,
      estimatedUsd: 0,
      safetyCeilingUsd: 0,
    },
  );

  return {
    provider: "gpt",
    stage: "output_1",
    quality: config.openai.imageQuality,
    requestSize: config.openai.imageRequestSize,
    productCount: products.length,
    pricingUsdPerMillion,
    ...roundMoney(totals),
    perProduct,
    optimizationComparison: aggregateOptimizationComparisons(perProduct),
    note:
      "Estimate only. OpenAI bills final GPT image usage from model-side image/text tokens, so actual cost can differ.",
  };
}

export async function estimateOutputTwoCost(input = {}) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError("Select at least one Output 1 image before estimating Output 2 cost.", 400);
  }

  const profileId = String(input.profileId || "").trim();
  if (!profileId) {
    throw new AppError("Select an Instagram output profile before estimating Output 2 cost.", 400);
  }

  const profile = getCompositionFormat(profileId);
  const promptTokens = await priceLabelPromptTokens();
  const requestBreakdown = input.items.map((item) => outputTwoRequestEstimate(item, profile, promptTokens));
  const totals = requestBreakdown.reduce(
    (sum, item) => ({
      requestCount: sum.requestCount + item.requestCount,
      textInputTokens: sum.textInputTokens + item.textInputTokens,
      imageInputTokens: sum.imageInputTokens + item.imageInputTokens,
      imageOutputTokens: sum.imageOutputTokens + item.imageOutputTokens,
      estimatedUsd: sum.estimatedUsd + item.estimatedUsd,
    }),
    {
      requestCount: 0,
      textInputTokens: 0,
      imageInputTokens: 0,
      imageOutputTokens: 0,
      estimatedUsd: 0,
    },
  );

  return {
    provider: "gpt",
    stage: "output_2",
    profileId: profile.id,
    outputDimensions: { width: profile.width, height: profile.height },
    quality: config.openai.imageQuality,
    selectedImageCount: input.items.length,
    paidRequestCount: totals.requestCount,
    localPreviewCount: requestBreakdown.filter((item) => item.outputKind === "local_preview").length,
    pricingUsdPerMillion,
    ...roundMoney({
      ...totals,
      safetyCeilingUsd: totals.estimatedUsd * safetyMultiplier,
    }),
    requestBreakdown: requestBreakdown.map((item) => roundMoney(item)),
    note:
      "Free Test selections use local composition only. Real selections require one GPT price-label edit per selected Output 1 image.",
  };
}

function estimateProduct(product, outputs) {
  const originals = product.originalImages || [];
  const requestBreakdown = outputs.map((output) => {
    const references = referencesForOutputRole(originals, output.role);
    const textInputTokens = estimateTextTokens(output.prompt);
    const imageInputTokens = references.reduce((sum, image) => sum + estimateImageInputTokens(image), 0);
    const imageOutputTokens = outputTokensByQuality[config.openai.imageQuality] || outputTokensByQuality.medium;

    return {
      role: output.role,
      label: output.label,
      referenceRoles: references.map((image) => image.role),
      referenceCount: references.length,
      textInputTokens,
      imageInputTokens,
      imageOutputTokens,
      estimatedUsd: costUsd({ textInputTokens, imageInputTokens, imageOutputTokens }),
    };
  });

  const totals = requestBreakdown.reduce(
    (sum, item) => ({
      requestCount: sum.requestCount + 1,
      textInputTokens: sum.textInputTokens + item.textInputTokens,
      imageInputTokens: sum.imageInputTokens + item.imageInputTokens,
      imageOutputTokens: sum.imageOutputTokens + item.imageOutputTokens,
      estimatedUsd: sum.estimatedUsd + item.estimatedUsd,
    }),
    {
      requestCount: 0,
      textInputTokens: 0,
      imageInputTokens: 0,
      imageOutputTokens: 0,
      estimatedUsd: 0,
    },
  );

  const rounded = roundMoney({
    ...totals,
    safetyCeilingUsd: totals.estimatedUsd * safetyMultiplier,
  });

  return {
    productId: product.id,
    productCode: product.sourceProductCode || product.id,
    outputCount: outputs.length,
    ...rounded,
    requestBreakdown: requestBreakdown.map((item) => roundMoney(item)),
  };
}

function sourceDimensionProduct(product) {
  return {
    ...product,
    originalImages: (product.originalImages || []).map((image) => ({
      ...image,
      width: image.sourceWidth || image.width,
      height: image.sourceHeight || image.height,
      sizeBytes: image.sourceSizeBytes || image.sizeBytes,
    })),
  };
}

function optimizationComparison(product, before, after) {
  const images = product.originalImages || [];
  const beforePixels = images.reduce((sum, image) => sum + Number(image.sourceWidth || image.width || 0) * Number(image.sourceHeight || image.height || 0), 0);
  const afterPixels = images.reduce((sum, image) => sum + Number(image.width || 0) * Number(image.height || 0), 0);
  const beforeBytes = images.reduce((sum, image) => sum + Number(image.sourceSizeBytes || image.sizeBytes || 0), 0);
  const afterBytes = images.reduce((sum, image) => sum + Number(image.sizeBytes || 0), 0);
  return comparisonResult(
    { ...before, inputPixels: beforePixels, inputBytes: beforeBytes },
    { ...after, inputPixels: afterPixels, inputBytes: afterBytes },
  );
}

function aggregateOptimizationComparisons(estimates) {
  const before = estimates.reduce((sum, item) => sumComparison(sum, item.optimizationComparison.before), emptyComparison());
  const after = estimates.reduce((sum, item) => sumComparison(sum, item.optimizationComparison.after), emptyComparison());
  return comparisonResult(before, after);
}

function comparisonResult(before, after) {
  const costSavings = Math.max(0, Number(before.estimatedUsd || 0) - Number(after.estimatedUsd || 0));
  const pixelSavingsPercent = before.inputPixels > 0 ? Math.max(0, (1 - after.inputPixels / before.inputPixels) * 100) : 0;
  const byteSavingsPercent = before.inputBytes > 0 ? Math.max(0, (1 - after.inputBytes / before.inputBytes) * 100) : 0;
  return {
    before: compactComparison(before),
    after: compactComparison(after),
    costSavingsUsd: Number(costSavings.toFixed(4)),
    costSavingsPercent: before.estimatedUsd > 0 ? Number(((costSavings / before.estimatedUsd) * 100).toFixed(1)) : 0,
    pixelSavingsPercent: Number(pixelSavingsPercent.toFixed(1)),
    byteSavingsPercent: Number(byteSavingsPercent.toFixed(1)),
  };
}

function compactComparison(value) {
  return {
    estimatedUsd: Number(Number(value.estimatedUsd || 0).toFixed(4)),
    safetyCeilingUsd: Number(Number(value.safetyCeilingUsd || 0).toFixed(4)),
    imageInputTokens: Number(value.imageInputTokens || 0),
    inputPixels: Number(value.inputPixels || 0),
    inputBytes: Number(value.inputBytes || 0),
  };
}

function emptyComparison() { return { estimatedUsd: 0, safetyCeilingUsd: 0, imageInputTokens: 0, inputPixels: 0, inputBytes: 0 }; }
function sumComparison(sum, value) {
  for (const key of Object.keys(sum)) sum[key] += Number(value?.[key] || 0);
  return sum;
}

function estimateTextTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function estimateImageInputTokens(image) {
  const width = Number(image.width || 1024);
  const height = Number(image.height || 1024);
  const scale = Math.min(1, 2048 / Math.max(width, height));
  const effectiveWidth = Math.max(1, Math.ceil(width * scale));
  const effectiveHeight = Math.max(1, Math.ceil(height * scale));
  const tiles = Math.ceil(effectiveWidth / 512) * Math.ceil(effectiveHeight / 512);
  return 65 + 129 * tiles;
}

async function priceLabelPromptTokens() {
  try {
    const prompts = await getAllPrompts();
    const prompt = prompts.find((item) => item.id === "price-label");
    return estimateTextTokens(prompt?.text || "");
  } catch {
    return 220;
  }
}

function outputTwoRequestEstimate(item, profile, promptTokens) {
  const product = getProductRecord(String(item.productId || ""));
  const generated = getGeneratedImage(Number(item.generatedImageId), product.id);
  const providerMode = normalizeProviderName(generated.provider || product.provider);

  if (isFreeTestProvider(providerMode)) {
    return {
      productId: product.id,
      productCode: product.source_product_code || product.id,
      generatedImageId: generated.id,
      sourceRole: generated.role,
      providerMode,
      outputKind: "local_preview",
      requestCount: 0,
      textInputTokens: 0,
      imageInputTokens: 0,
      imageOutputTokens: 0,
      estimatedUsd: 0,
    };
  }

  const composedImageTokens = estimateImageInputTokens({ width: profile.width, height: profile.height });
  const referenceTokens = estimateImageInputTokens({ width: 1080, height: 1080 });
  const imageInputTokens = composedImageTokens + referenceTokens;
  const imageOutputTokens = estimateOutputImageTokens(profile);
  const textInputTokens = promptTokens;

  return {
    productId: product.id,
    productCode: product.source_product_code || product.id,
    generatedImageId: generated.id,
    sourceRole: generated.role,
    providerMode,
    outputKind: "final_ai",
    requestCount: 1,
    textInputTokens,
    imageInputTokens,
    imageOutputTokens,
    estimatedUsd: costUsd({ textInputTokens, imageInputTokens, imageOutputTokens }),
  };
}

function getGeneratedImage(generatedImageId, productId) {
  if (!Number.isInteger(generatedImageId)) {
    throw new AppError("Each selected image must include a valid generatedImageId.", 400);
  }

  const image = db.prepare("SELECT * FROM product_generated_images WHERE id = ?").get(generatedImageId);
  if (!image || image.product_id !== productId) {
    throw new AppError("Selected Output 1 image does not belong to the selected product.", 400);
  }

  return image;
}

function estimateOutputImageTokens(profile) {
  const base = outputTokensByQuality[config.openai.imageQuality] || outputTokensByQuality.medium;
  const ratio = (profile.width * profile.height) / (1080 * 1080);
  return Math.ceil(base * Math.max(0.5, Math.min(1.8, ratio)));
}

function costUsd({ textInputTokens = 0, imageInputTokens = 0, imageOutputTokens = 0 }) {
  return (
    (textInputTokens * pricingUsdPerMillion.textInput) / 1_000_000 +
    (imageInputTokens * pricingUsdPerMillion.imageInput) / 1_000_000 +
    (imageOutputTokens * pricingUsdPerMillion.imageOutput) / 1_000_000
  );
}

function roundMoney(value) {
  if (typeof value === "number") return Number(value.toFixed(4));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "number" && key.toLowerCase().includes("usd") ? Number(entry.toFixed(4)) : entry,
    ]),
  );
}
