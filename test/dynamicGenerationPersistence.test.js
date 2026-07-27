import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

test("gallery and dynamic-ad outputs replace only their own roles", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-dynamic-retention-"));
  process.env.DATABASE_PATH = path.join(root, "products.sqlite");
  process.env.UPLOADS_DIR = path.join(root, "uploads");

  const databaseModule = await import("../src/db/database.js");
  const {
    createProductFromUpload,
    getProductById,
    replaceGeneratedImages,
  } = await import("../src/services/productService.js");

  try {
    const reference = await imageBuffer("#d2b66f");
    const product = await createProductFromUpload({
      front: [upload(reference, "front.png")],
      side: [upload(reference, "side.png")],
      angle: [upload(reference, "angle.png")],
    });
    const generatedDir = path.join(root, "generated");
    await fs.mkdir(generatedDir, { recursive: true });

    const initial = [];
    for (const role of ["front", "side", "angle", "model", "dynamic-ad"]) {
      initial.push(await generatedImage(generatedDir, role, `${role}-initial.png`));
    }
    await replaceGeneratedImages(product.id, initial);

    const oldDynamicPath = initial.find((image) => image.role === "dynamic-ad").path;
    const nextDynamic = await generatedImage(generatedDir, "dynamic-ad", "dynamic-next.png");
    await replaceGeneratedImages(product.id, [nextDynamic], { replaceRoles: ["dynamic-ad"] });

    const afterDynamic = getProductById(product.id);
    assert.deepEqual(
      afterDynamic.generatedImages.map((image) => image.role).sort(),
      ["angle", "dynamic-ad", "front", "model", "side"],
    );
    assert.equal(
      afterDynamic.generatedImages.find((image) => image.role === "dynamic-ad").filename,
      "dynamic-next.png",
    );
    await assert.rejects(fs.access(oldDynamicPath));

    const replacementGallery = [];
    for (const role of ["front", "side", "angle", "model"]) {
      replacementGallery.push(await generatedImage(generatedDir, role, `${role}-replacement.png`));
    }
    await replaceGeneratedImages(product.id, replacementGallery, {
      replaceRoles: ["front", "side", "angle", "model"],
    });

    const afterGallery = getProductById(product.id);
    assert.equal(afterGallery.generatedImages.length, 5);
    assert.equal(
      afterGallery.generatedImages.find((image) => image.role === "dynamic-ad").filename,
      "dynamic-next.png",
    );
    assert.equal(
      afterGallery.generatedImages.find((image) => image.role === "front").filename,
      "front-replacement.png",
    );
  } finally {
    databaseModule.closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
});

function upload(buffer, originalname) {
  return {
    buffer,
    size: buffer.length,
    originalname,
  };
}

async function generatedImage(directory, role, filename) {
  const buffer = await imageBuffer(role === "dynamic-ad" ? "#263d39" : "#f2eee7");
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, buffer);
  return {
    role,
    filename,
    path: filePath,
    mimeType: "image/png",
    sizeBytes: buffer.length,
    width: 40,
    height: 40,
    provider: "gemini",
    prompt: `Prompt for ${role}`,
  };
}

function imageBuffer(background) {
  return sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background,
    },
  }).png().toBuffer();
}
