// Defines the allowed store-account providers and encrypted credential labels.

export const ACCOUNT_PROVIDER_OPTIONS = [
  { code: "facebook", label: "فيسبوك" },
  { code: "instagram", label: "إنستغرام" },
  { code: "tiktok", label: "تيك توك" },
  { code: "daftra", label: "دفترة" },
  { code: "salla", label: "سلة" },
  { code: "google", label: "جوجل" },
  { code: "other", label: "حساب آخر" },
];

export const ACCOUNT_CREDENTIAL_KINDS = [
  { code: "password", label: "كلمة مرور" },
  { code: "api_key", label: "مفتاح API" },
  { code: "access_token", label: "رمز وصول" },
  { code: "other", label: "بيانات دخول أخرى" },
];

export function providerLabel(code, customLabel) {
  return code === "other" ? customLabel : ACCOUNT_PROVIDER_OPTIONS.find((item) => item.code === code)?.label;
}
