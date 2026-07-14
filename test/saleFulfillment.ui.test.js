// Guards the visible sale payment and delivery workflow and its API wiring.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manual sale includes initial payment and delivery appointment fields", () => {
  const source = fs.readFileSync("client/src/features/crm/SaleWorkspace.jsx", "utf8");
  assert.match(source, /الدفعة الأولى/);
  assert.match(source, /المبلغ المدفوع الآن/);
  assert.match(source, /تاريخ التسليم/);
  assert.match(source, /type="date"/);
  assert.match(source, /اليوم \/ الشهر \/ السنة فقط/);
  assert.doesNotMatch(source, /type="datetime-local"/);
  assert.match(source, /deliveryMode/);
  assert.match(source, /scheduledDeliveryAt/);
});

test("sale history exposes immutable payment and delivery actions", () => {
  const source = fs.readFileSync("client/src/features/crm/SalesDashboard.jsx", "utf8");
  const api = fs.readFileSync("client/src/features/crm/crmApi.js", "utf8");
  assert.match(source, /إضافة دفعة/);
  assert.match(source, /رد مبلغ/);
  assert.match(source, /تم التسليم/);
  assert.match(source, /formatDeliveryDate/);
  assert.match(api, /\/payments/);
  assert.match(api, /\/refunds/);
  assert.match(api, /\/delivery/);
});
