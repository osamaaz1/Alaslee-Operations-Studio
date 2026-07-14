// Guards the sales command center, required invoice, routing, and live lookup workflow.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manual sale requires invoice and uses bounded instant customer and product search", () => {
  const sale = fs.readFileSync("client/src/features/crm/SaleWorkspace.jsx", "utf8");
  const lookup = fs.readFileSync("client/src/features/crm/InstantSearchCombobox.jsx", "utf8");
  assert.match(sale, /رقم الفاتورة/);
  assert.match(sale, /invoiceNumber/);
  assert.match(sale, /crmApi\.customers\(query, \{ limit: 20, signal \}\)/);
  assert.match(sale, /availableOnly: true, limit: 20, signal/);
  assert.match(lookup, /role="combobox"/);
  assert.match(lookup, /aria-autocomplete="list"/);
  assert.match(lookup, /AbortController/);
  assert.match(lookup, /220/);
});

test("sales dashboard explains priorities and exposes accessible delivery details", () => {
  const dashboard = fs.readFileSync("client/src/features/crm/SalesDashboard.jsx", "utf8");
  assert.match(dashboard, /متأخرون عن الاستلام/);
  assert.match(dashboard, /تسليمات اليوم/);
  assert.match(dashboard, /جاهز للاستلام/);
  assert.match(dashboard, /role="dialog"/);
  assert.match(dashboard, /aria-modal="true"/);
  assert.match(dashboard, /event\.key === "Escape"/);
  assert.match(dashboard, /event\.key === "Tab"/);
  assert.match(dashboard, /customer_phone/);
  assert.match(dashboard, /remaining_amount/);
});

test("successful sale routes to CRM sales and home exposes the delivery center", () => {
  const workspace = fs.readFileSync("client/src/features/crm/CrmWorkspace.jsx", "utf8");
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  assert.match(workspace, /sales: "\/crm\/sales"/);
  assert.match(workspace, /"new-sale": "\/crm\/new-sale"/);
  assert.match(workspace, /onSaleSaved=.*openView\("sales"\)/s);
  assert.match(app, /startsWith\("\/crm\/"\)/);
  assert.match(app, /فتح مركز التسليم/);
  assert.match(app, /navigatePath\("\/crm\/sales"\)/);
});
