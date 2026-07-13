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
  assert.match(service, /reserved_quantity/);
  assert.match(service, /available_quantity/);
  assert.match(service, /delivery_status IN \('pending','ready'\)/);
  assert.match(service, /COALESCE\(p\.track_stock,false\) = false/);
});

test("CRM lists the complete local customer and Daftra snapshots", () => {
  const customers = fs.readFileSync("src/services/crmCustomerService.js", "utf8");
  const products = fs.readFileSync("src/services/daftraCatalogService.js", "utf8");
  const settings = fs.readFileSync("client/src/features/crm/CrmSettings.jsx", "utf8");
  assert.match(customers, /customerListLimit = 5_000/);
  assert.match(products, /productListLimit = 5_000/);
  assert.match(settings, /crmApi\.importHistory\(\)/);
  assert.match(settings, /استيراد بيانات التحليل/);
});
