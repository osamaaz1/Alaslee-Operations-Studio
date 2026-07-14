import { test, expect } from "@playwright/test";

test("staff can search imported customers and Daftra products, then register a scheduled sale", async ({ page }) => {
  const navigationStartedAt = Date.now();
  await page.goto("/crm/sales");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "أدخل رمز إدارة العملاء" })).toBeVisible();
  expect(Date.now() - navigationStartedAt).toBeLessThan(3000);
  await page.getByLabel("رمز الدخول").fill(process.env.CRM_STAFF_PIN);
  await page.getByRole("button", { name: "دخول", exact: true }).click();

  await expect(page.getByRole("heading", { name: "علاقة أذكى مع كل عميل." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ما الذي يحتاج تدخلك؟" })).toBeVisible();
  await page.getByRole("button", { name: "بيع جديد", exact: true }).click();
  await expect(page.getByRole("heading", { name: "تسجيل بيع للعميل" })).toBeVisible();

  const invoiceNumber = `E2E-${Date.now()}`;
  await page.getByLabel("رقم الفاتورة").fill(invoiceNumber);

  const customer = page.getByPlaceholder("اكتب اسم العميل أو رقم الهاتف");
  await customer.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await customer.press("Enter");

  const product = page.getByPlaceholder("اكتب اسم المنتج أو SKU أو الباركود");
  await product.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await product.press("Enter");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();

  const reason = page.getByPlaceholder("مثال: تم التأكد من توفر القطعة في الفرع");
  if (await reason.isVisible().catch(() => false)) await reason.fill("اختبار إنتاج معزول");
  await page.getByLabel("طريقة التسليم").selectOption("scheduled");
  const deliveryDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("تاريخ التسليم").fill(deliveryDate);
  await page.getByRole("button", { name: "تسجيل البيع", exact: true }).click();

  await expect(page).toHaveURL(/\/crm\/sales$/);
  await expect(page.getByText("تم تسجيل البيع بنجاح", { exact: true })).toBeVisible();
  await expect(page.getByText(invoiceNumber, { exact: false }).first()).toBeVisible();
});
