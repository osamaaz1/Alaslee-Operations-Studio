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

test("single-product production exposes progressive dynamic advertising controls", () => {
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  const progress = fs.readFileSync("client/src/features/production/GenerationProgress.jsx", "utf8");
  const estimate = fs.readFileSync("client/src/features/production/GenerationCostEstimate.jsx", "utf8");
  const styles = fs.readFileSync("client/src/product-upload.css", "utf8");

  assert.match(app, /إعلان إبداعي/);
  assert.match(app, /label="شاشة مربعة"/);
  assert.match(app, /label="شاشة طولية"/);
  assert.doesNotMatch(app, /label="شاشة مربعة[^"]*\d/);
  assert.doesNotMatch(app, /label="شاشة طولية[^"]*\d/);
  assert.match(app, /النظارة في يد شخص/);
  assert.match(app, /ديكور مستوحى من الهوية/);
  assert.match(app, /شخص يرتدي النظارة/);
  assert.match(app, /creativeStyle === "person" \? <div className="dynamic-person-options">/);
  assert.match(app, /قهوة عصرية/);
  assert.match(app, /كلاسيكي في الشارع/);
  assert.match(app, /رسمي وعصري/);
  assert.match(app, /سعودي عصري مميز/);
  assert.match(app, /generationMode === "dynamic-ad"\s*\?\s*\[dynamicAdRole\]/);
  assert.match(app, /image\.role !== dynamicAdRole/);
  assert.match(app, /provider === "free-test" && generationMode === "dynamic-ad"/);
  assert.match(app, /وضع Try Free مخصص لمعاينة صور المتجر/);
  assert.match(progress, /"dynamic-ad": "الإعلان الإبداعي"/);
  assert.match(estimate, /query\.set\("outputFormat"/);
  assert.match(estimate, /query\.set\("creativeStyle"/);
  assert.match(styles, /\.generated-output-grid\.portrait/);
  assert.match(styles, /aspect-ratio:\s*9\s*\/\s*16/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test("generation failures render a warning without crashing the workspace", () => {
  const app = fs.readFileSync("client/src/App.jsx", "utf8");
  const main = fs.readFileSync("client/src/main.jsx", "utf8");

  assert.match(app, /CircleAlert,/);
  assert.match(app, /<CircleAlert size=\{18\}/);
  assert.match(main, /import \{ ErrorBoundary \} from "\.\/ErrorBoundary\.jsx"/);
  assert.match(main, /<ErrorBoundary>\s*<App \/>\s*<\/ErrorBoundary>/);
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
