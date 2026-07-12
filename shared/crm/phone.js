// Normalizes country-aware phone input into E.164 values.

import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhone(input) {
  const country = String(input?.countryCode || "SA").toUpperCase();
  const raw = String(input?.number || "").trim();
  if (!raw || /[^\d+\s()-]/.test(raw)) throw new Error("رقم الهاتف يقبل الأرقام فقط.");
  const compact = raw.replace(/[\s()-]/g, "");
  if (country === "SA" && compact.startsWith("0") && !/^05\d{8}$/.test(compact)) {
    throw new Error("رقم الجوال السعودي المحلي يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.");
  }
  const parsed = parsePhoneNumberFromString(compact, country);
  if (!parsed?.isValid()) throw new Error("رقم الهاتف غير صالح للدولة المحددة.");
  return { countryCode: parsed.country || country, e164: parsed.number };
}

export function tryNormalizePhone(input) {
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}
