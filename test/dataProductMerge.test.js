import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeProductRows } from "../src/services/dataProductMergeService.js";

test("product merge updates Invoice_items.csv and creates a backup", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oe-product-merge-"));
  try {
    await writeFile(
      path.join(tempRoot, "Invoice_items.csv"),
      [
        "no,item,description,unit_price,quantity,subtotal",
        '00001,"Source Product"," ",10,2,20',
        '00002,"Target Product"," ",15,1,15',
        '00003,"Source Product"," ",10,1,10',
      ].join("\n"),
      "utf8",
    );

    const result = await mergeProductRows(
      { sourceId: "text:source", targetId: "text:target" },
      {
        dataRoot: tempRoot,
        rows: [
          { id: "text:source", name: "Source Product", sourceNames: ["Source Product"] },
          { id: "text:target", name: "Target Product", sourceNames: ["Target Product"] },
        ],
      },
    );

    const updated = await readFile(path.join(tempRoot, "Invoice_items.csv"), "utf8");
    await access(result.backupPath);

    assert.equal(result.changedRows, 2);
    assert.equal((updated.match(/Target Product/g) || []).length, 3);
    assert.equal(updated.includes("Source Product"), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
