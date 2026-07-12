import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

let baseUrl;
let closeDatabase;
let server;
let tempRoot;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "oe-api-"));
  process.env.DATABASE_PATH = path.join(tempRoot, "products.sqlite");
  process.env.UPLOADS_DIR = path.join(tempRoot, "uploads");
  process.env.ALLOWED_IMPORT_ROOTS = tempRoot;
  process.env.ADMIN_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.AI_PROVIDER = "gemini";
  process.env.RATE_LIMIT_MAX = "10000";

  const appModule = await import("../src/app.js");
  const databaseModule = await import("../src/db/database.js");
  closeDatabase = databaseModule.closeDatabase;
  server = appModule.createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  closeDatabase();
  await rm(tempRoot, { recursive: true, force: true });
});

test("Free Test creates mock Output 1 and local-preview Output 2 without AI credentials", async () => {
  const product = await uploadSingleProduct();
  assert.equal(product.originalImages.length, 3);
  assert.equal(product.originalImages.every((image) => image.sourceUrl), true);
  assert.equal(product.originalImages.every((image) => image.sourceWidth && image.sourceHeight), true);

  const estimate = await getJson(`/v1/products/${product.id}/output-1/estimate`);
  assert.equal(estimate.provider, "gpt");
  assert.equal(estimate.quality, "medium");
  assert.equal(estimate.requestCount, 4);
  assert.equal(estimate.outputCount, 4);
  assert.equal(estimate.estimatedUsd > 0, true);
  assert.equal(estimate.safetyCeilingUsd >= estimate.estimatedUsd, true);
  assert.equal(Boolean(estimate.optimizationComparison?.before), true);
  assert.equal(Boolean(estimate.optimizationComparison?.after), true);
  assert.equal(estimate.requestBreakdown.every((item) => item.referenceCount <= 3), true);

  const output1 = await postForm(`/v1/products/${product.id}/output-1/mock`, new FormData());
  assert.equal(output1.generatedImages.length, 4);
  assert.equal(output1.provider, "free-test");
  assert.equal(output1.generatedImages.every((image) => image.provider === "free-test"), true);
  assert.equal(output1.generatedImages.every((image) => image.isMock === true), true);

  await expectJsonError("/v1/instagram/generate", {
    profileId: "square-1x1",
    items: [{ productId: product.id, generatedImageId: output1.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-LOCAL-001", price: "$99" },
    },
  }, "Instagram branding requires accessible assets");

  const branding = await uploadBrandKit();
  assert.equal(branding.ready, true);
  assert.equal(branding.priceLabelReady, false);

  await expectJsonError("/v1/instagram/generate", {
    profileId: "",
    items: [{ productId: product.id, generatedImageId: output1.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-LOCAL-001", price: "$99" },
    },
  }, "Select an Instagram output profile.");

  await expectJsonError("/v1/instagram/generate", {
    profileId: "square-1x1",
    items: [{ productId: product.id, generatedImageId: output1.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "", price: "$99" },
    },
  }, "Price and SKU are required");

  const output2Estimate = await postJson("/v1/instagram/estimate", {
    profileId: "square-1x1",
    items: [{ productId: product.id, generatedImageId: output1.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-LOCAL-001", price: "$99" },
    },
  });
  assert.equal(output2Estimate.stage, "output_2");
  assert.equal(output2Estimate.selectedImageCount, 1);
  assert.equal(output2Estimate.paidRequestCount, 0);
  assert.equal(output2Estimate.localPreviewCount, 1);
  assert.equal(output2Estimate.estimatedUsd, 0);

  const instagram = await postJson("/v1/instagram/generate", {
    profileId: "square-1x1",
    items: [{ productId: product.id, generatedImageId: output1.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-LOCAL-001", price: "$99" },
    },
  });
  assert.equal(instagram.successful, 1);
  assert.equal(instagram.failed, 0);
  assert.equal(instagram.results[0].providerMode, "free-test");
  assert.equal(instagram.results[0].outputKind, "local_preview");
  assert.equal(instagram.results[0].isFinal, false);

  const output2 = await getJson(`/v1/products/${product.id}/output-2`);
  assert.equal(output2.length, 1);
  assert.equal(output2[0].outputKind, "local_preview");
  assert.equal(output2[0].isMock, true);
  assert.equal(output2[0].isFinal, false);
  assert.equal(output2[0].productSku, "SKU-LOCAL-001");
  assert.equal(output2[0].productPrice, "$99");
  assert.equal(output2[0].priceLabelReferencePath, null);
  assert.equal(output2[0].width, 1080);
  assert.equal(output2[0].height, 1080);
});

test("large uploaded references use optimized files and reduce the GPT input estimate", async () => {
  const product = await uploadSingleProduct(1200, 1600);
  assert.equal(product.originalImages.every((image) => image.width === 1152 && image.height === 1536), true);
  assert.equal(product.originalImages.every((image) => image.sourceWidth === 1200 && image.sourceHeight === 1600), true);
  const estimate = await getJson(`/v1/products/${product.id}/output-1/estimate`);
  const comparison = estimate.optimizationComparison;
  assert.equal(comparison.before.inputPixels > comparison.after.inputPixels, true);
  assert.equal(comparison.before.imageInputTokens > comparison.after.imageInputTokens, true);
  assert.equal(comparison.before.estimatedUsd > comparison.after.estimatedUsd, true);
});

test("Direct Instagram upload creates selectable Output 1 sources without generation", async () => {
  const formData = new FormData();
  formData.append("images", await fileBlob(360, 220, "#245f72"), "ready-front.png");

  const product = await postForm("/v1/instagram/uploads", formData);
  assert.equal(product.inputMode, "instagram_direct_upload");
  assert.equal(product.provider, "gpt");
  assert.equal(product.originalImages.length, 0);
  assert.equal(product.generatedImages.length, 1);
  assert.equal(product.generatedImages[0].provider, "gpt");
  assert.equal(product.generatedImages[0].outputStage, "output_1");
  assert.equal(product.generatedImages[0].outputKind, "direct_upload");
  assert.equal(product.generatedImages[0].isMock, false);

  const estimate = await postJson("/v1/instagram/estimate", {
    profileId: "square-1x1",
    items: [{ productId: product.id, generatedImageId: product.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-DIRECT-001", price: "$89" },
    },
  });

  assert.equal(estimate.stage, "output_2");
  assert.equal(estimate.selectedImageCount, 1);
  assert.equal(estimate.paidRequestCount, 1);
  assert.equal(estimate.localPreviewCount, 0);
  assert.equal(estimate.requestBreakdown[0].outputKind, "final_ai");
});

test("Batch Free Test Output 2 is saved under uploads/products/batch/product/instagram", async () => {
  await uploadBrandKit();
  const batchSource = path.join(tempRoot, "batch-source");
  await mkdir(batchSource, { recursive: true });
  const image = await imagePng(240, 180, "#2a6fbb");
  await writeFile(path.join(batchSource, "P100-1.png"), image);
  await writeFile(path.join(batchSource, "P100-2.png"), image);
  await writeFile(path.join(batchSource, "P100-3.png"), image);

  const imported = await postJson("/v1/batches/import-folder", {
    folderPath: batchSource,
    provider: "free-test",
    brandingEnabled: false,
  });
  assert.equal(imported.products.length, 1);
  assert.equal(imported.skippedProducts.length, 0);

  const estimate = await getJson(`/v1/batches/${imported.batch.id}/output-1/estimate`);
  assert.equal(estimate.provider, "gpt");
  assert.equal(estimate.quality, "medium");
  assert.equal(estimate.productCount, 1);
  assert.equal(estimate.requestCount, 4);

  const generated = await postJson(`/v1/batches/${imported.batch.id}/generate`, { force: true });
  assert.equal(generated.results.successful, 1);

  const product = await getJson(`/v1/products/${generated.products[0].id}`);
  const instagram = await postJson(`/v1/batches/${imported.batch.id}/instagram`, {
    profileId: "portrait-4x5",
    items: [{ productId: product.id, generatedImageId: product.generatedImages[0].id }],
    products: {
      [product.id]: { sku: "SKU-BATCH-001", price: "$119" },
    },
  });

  assert.equal(instagram.successful, 1);
  const normalizedPath = instagram.results[0].finalPath.split(path.sep).join("/");
  assert.match(normalizedPath, new RegExp(`/uploads/products/${escapeRegExp(imported.batch.id)}/P100/instagram/`));
});

async function uploadSingleProduct(width = 300, height = 180) {
  const formData = new FormData();
  formData.append("front", await fileBlob(width, height, "#204f45"), "front.png");
  formData.append("side", await fileBlob(width, height, "#365a91"), "side.png");
  formData.append("angle", await fileBlob(width, height, "#7a3e64"), "angle.png");
  return postForm("/v1/products/upload", formData);
}

async function uploadBrandKit() {
  const formData = new FormData();
  formData.append("background", await fileBlob(1080, 1350, "#f4efe7"), "background.png");
  formData.append("logo", await fileBlob(260, 120, "#163d35"), "logo.png");
  formData.append("footer", await fileBlob(900, 130, "#111111"), "footer.png");
  return postForm("/v1/branding/assets", formData);
}

async function getJson(url) {
  const response = await fetch(`${baseUrl}${url}`);
  return responseData(response);
}

async function postJson(url, payload) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return responseData(response);
}

async function expectJsonError(url, payload, messagePart) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.ok, false);
  assert.equal(body.success, false);
  assert.match(body.errors?.[0]?.message || "", new RegExp(escapeRegExp(messagePart)));
}

async function postForm(url, formData) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    body: formData,
  });
  return responseData(response);
}

async function responseData(response) {
  const body = await response.json();
  assert.equal(body.success, true, body.errors?.[0]?.message);
  assert.deepEqual(body.errors, []);
  assert.equal(response.ok, true);
  return body.data;
}

async function fileBlob(width, height, color) {
  return new Blob([await imagePng(width, height, color)], { type: "image/png" });
}

function imagePng(width, height, color) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
