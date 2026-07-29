import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const app = await readFile(path.resolve("client/src/App.jsx"), "utf8");
const editor = await readFile(path.resolve("client/src/features/production/BrandOverlayEditor.jsx"), "utf8");
const styles = await readFile(path.resolve("client/src/brand-overlay.css"), "utf8");

test("generated image galleries expose optional single and bulk identity actions", () => {
  assert.match(app, /إضافة الهوية للمحدد/);
  assert.match(app, /إضافة الهوية/);
  assert.match(app, /selectedImages/);
  assert.match(app, /BrandOverlayEditor/);
  assert.match(app, /image\.productId \|\| productId/);
  assert.match(app, /الصور النهائية بالهوية/);
});

test("identity editor includes catalog choices, lossless notice, preview, and final results", () => {
  assert.match(editor, /brand-overlay\/catalog/);
  assert.match(editor, /brand-overlay\/preview/);
  assert.match(editor, /brand-overlay\/render/);
  assert.match(editor, /لا قص، لا تمديد/);
  assert.match(editor, /النتيجة النهائية جاهزة/);
  assert.match(editor, /alasleeVariants/);
});

test("superuser mini-canvas provides drag, resize, keyboard, and scoped persistence controls", () => {
  assert.match(editor, /startInteraction/);
  assert.match(editor, /ArrowLeft/);
  assert.match(editor, /حفظ كتوزيع عام/);
  assert.match(editor, /حفظ شعار الماركة/);
  assert.match(editor, /reset-brand/);
  assert.match(styles, /touch-action:\s*none/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
