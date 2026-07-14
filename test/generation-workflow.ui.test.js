// Protects the Arabic generation and CRM interaction contracts in the React workspace.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("production exposes optional model generation, live per-image progress, and Gemini fallback", () => {
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  const progress = fs.readFileSync("client/src/features/production/GenerationProgress.jsx", "utf8");
  const styles = fs.readFileSync("client/src/styles.css", "utf8");

  assert.match(app, /useState\(true\)/);
  assert.match(app, /توليد صورة لشخص لابس النظارة/);
  assert.match(app, /هل النظارة رجالية أم نسائية/);
  assert.match(app, /output-1\/progress/);
  assert.match(progress, /تم توليد الصورة/);
  assert.match(progress, /خلال/);
  assert.match(progress, /نعم، حوّل إلى GPT/);
  assert.match(progress, /role="dialog"/);
  assert.match(styles, /prefers-reduced-motion\s*:\s*reduce/);
});

test("customer workspace removes consent and allows staff to append a new prescription", () => {
  const fields = fs.readFileSync("client/src/features/crm/PrescriptionFields.jsx", "utf8");
  const customers = fs.readFileSync("client/src/features/crm/CustomerList.jsx", "utf8");
  const form = fs.readFileSync("client/src/features/crm/CustomerForm.jsx", "utf8");

  assert.doesNotMatch(fields, /consent/i);
  assert.match(customers, /إضافة كشف جديد/);
  assert.match(customers, /crmApi\.addPrescription/);
  assert.match(form, /فتح ملف العميل/);
});
