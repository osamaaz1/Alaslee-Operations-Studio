import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("inventory hides zero-stock products by default and can reveal them", () => {
  const source = fs.readFileSync("client/src/features/crm/InventoryWorkspace.jsx", "utf8");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /visibleProducts = useMemo/);
  assert.match(source, /aria-pressed=\{showOutOfStock\}/);
  assert.match(source, /إظهار المنتهي/);
});

test("sale product lookup requests available products only", () => {
  const sale = fs.readFileSync("client/src/features/crm/SaleWorkspace.jsx", "utf8");
  const service = fs.readFileSync("src/services/daftraCatalogService.js", "utf8");
  assert.match(sale, /availableOnly: true/);
  assert.match(service, /COALESCE\(p\.stock_balance,0\) > 0/);
  assert.match(service, /COALESCE\(p\.track_stock,false\) = false/);
});
