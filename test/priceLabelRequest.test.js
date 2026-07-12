import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("price label edit omits input_fidelity for gpt-image-2", async () => {
  const source = await readFile("src/services/priceLabelEditService.js", "utf8");
  assert.match(source, /if \(!this\.model\.startsWith\("gpt-image-2"\)\)/);
  assert.match(source, /request\.input_fidelity = "high"/);
});
