import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { scanBatchFolder } from "../src/services/batchFolderScanner.js";

test("batch scanner groups required roles, extra details, incomplete products, and duplicates", async () => {
  const root = await makeTempDir();
  const image = await png();

  await writeFile(path.join(root, "A-1.png"), image);
  await writeFile(path.join(root, "A-2.png"), image);
  await writeFile(path.join(root, "A-3.png"), image);
  await writeFile(path.join(root, "A-4.png"), image);
  await writeFile(path.join(root, "A-5.png"), image);

  await writeFile(path.join(root, "B-1.png"), image);
  await writeFile(path.join(root, "B-2.png"), image);

  await writeFile(path.join(root, "C-1.png"), image);
  await writeFile(path.join(root, "C-01.png"), image);
  await writeFile(path.join(root, "C-2.png"), image);
  await writeFile(path.join(root, "C-3.png"), image);

  await writeFile(path.join(root, "notes.txt"), "ignore");

  const result = await scanBatchFolder(root);
  const byCode = new Map(result.products.map((product) => [product.productCode, product]));

  assert.equal(byCode.get("A").isComplete, true);
  assert.equal(byCode.get("A").hasDuplicateRoles, false);
  assert.deepEqual(byCode.get("A").files.map((file) => file.role), [
    "front",
    "side",
    "angle",
    "temple",
    "detail-5",
  ]);

  assert.equal(byCode.get("B").isComplete, false);
  assert.equal(byCode.get("C").hasDuplicateRoles, true);
  assert.equal(result.skippedFiles[0].filename, "notes.txt");
});

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), "oe-batch-scan-"));
}

function png() {
  return sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: "#cc3344",
    },
  })
    .png()
    .toBuffer();
}
