import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("production navigation and home omit internal financial reporting", () => {
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  const visibleShell = app.slice(0, app.indexOf("function DataWorkspace"));
  assert.doesNotMatch(visibleShell, /id: "data"/);
  assert.doesNotMatch(visibleShell, /إجمالي المبيعات|الفواتير غير المسددة/);
});

test("CRM navigation and visible tables omit financial values", () => {
  const workspace = fs.readFileSync("client/src/features/crm/CrmWorkspace.jsx", "utf8");
  const customers = fs.readFileSync("client/src/features/crm/CustomerList.jsx", "utf8");
  const inventory = fs.readFileSync("client/src/features/crm/InventoryWorkspace.jsx", "utf8");
  const settings = fs.readFileSync("client/src/features/crm/CrmSettings.jsx", "utf8");
  assert.doesNotMatch(workspace, /SaleWorkspace|المبيعات اليدوية/);
  assert.doesNotMatch(customers, /monetary|money\.format|<th>القيمة<\/th>/);
  assert.doesNotMatch(inventory, /money\.format|سعر البيع|أقل سعر|ضوابط السعر/);
  assert.doesNotMatch(settings, /RfmEditor|monetary|المبيعات|sales_count/);
});
