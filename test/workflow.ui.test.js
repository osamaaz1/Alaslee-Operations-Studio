import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const app = await readFile(path.resolve("client/src/App.jsx"), "utf8");
const html = await readFile(path.resolve("client/index.html"), "utf8");

test("V2 is an Arabic RTL unified operations workspace", () => {
  assert.match(html, /lang="ar" dir="rtl"/);
  assert.match(app, /"الرئيسية"/);
  assert.match(app, /"المنتجات والإنتاج"/);
  assert.match(app, /"الحملات"/);
  assert.match(app, /"البيانات"/);
  assert.match(app, /"إدارة العملاء"/);
  assert.match(app, /"التكاملات والإعدادات"/);
  assert.doesNotMatch(app, /data-partition/);
});

test("V2 preserves the product, campaign, data, and Salla API surfaces", () => {
  for (const endpoint of ["/products/upload", "/products/generate", "/branding/assets", "/instagram/uploads", "/instagram/generate", "/data/summary", "/salla/status", "/prompts"]) {
    assert.equal(app.includes(endpoint), true);
  }
});

test("V2 exposes the independent Arabic CRM workspace", () => {
  assert.match(app, /CrmWorkspace/);
  assert.match(app, /UsersRound/);
});

test("V2 keeps Arabic production workflow modes and provider choices", () => {
  assert.match(app, /منتج واحد/);
  assert.match(app, /دفعة منتجات/);
  assert.match(app, /Gemini/);
  assert.match(app, /GPT/);
  assert.match(app, /Try Free/);
});
