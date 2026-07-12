// Defines shared customer, Saudi address, and phone validation contracts.

import { z } from "zod";
import { CURRENT_YEAR } from "./constants.js";
import { validateSaudiIdentity } from "./identity.js";
import { normalizePhone } from "./phone.js";
import { prescriptionSchema } from "./prescriptionSchemas.js";

const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(""));
const numericString = (length, label) => z.string().regex(new RegExp(`^\\d{${length}}$`), `${label} يجب أن يتكون من ${length} أرقام.`);

export const phoneInputSchema = z.object({
  countryCode: z.string().trim().length(2).default("SA"),
  number: z.string().trim().min(1, "رقم الهاتف مطلوب."),
}).superRefine((value, context) => {
  try { normalizePhone(value); } catch (error) {
    context.addIssue({ code: "custom", path: ["number"], message: error.message });
  }
});

export const addressSchema = z.object({
  buildingNumber: numericString(4, "رقم المبنى"),
  streetName: z.string().trim().min(2, "اسم الشارع مطلوب.").max(120),
  secondaryNumber: numericString(4, "الرقم الثانوي"),
  district: z.string().trim().min(2, "الحي مطلوب.").max(100),
  city: z.string().trim().min(2, "المدينة مطلوبة.").max(100),
  postalCode: numericString(5, "الرمز البريدي"),
  shortAddress: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{4}$/, "العنوان المختصر يتكون من 4 أحرف و4 أرقام."),
  countryCode: z.literal("SA").default("SA"),
});

export const customerCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم العميل مطلوب.").max(160),
  primaryPhone: phoneInputSchema,
  hasWhatsapp: z.boolean().default(true),
  whatsappPhone: phoneInputSchema.optional().nullable(),
  identityNumber: optionalText(10).refine((value) => !value || validateSaudiIdentity(value), "رقم الهوية أو الإقامة غير صالح."),
  birthYear: optionalNumber(1900, CURRENT_YEAR, "سنة الميلاد غير صالحة."),
  sourceCode: z.string().trim().min(1, "مصدر العميل مطلوب.").max(50),
  address: addressSchema.optional().nullable(),
  prescription: prescriptionSchema.optional().nullable(),
}).superRefine((value, context) => {
  if (!value.hasWhatsapp && !value.whatsappPhone) {
    context.addIssue({ code: "custom", path: ["whatsappPhone"], message: "أدخل رقماً بديلاً عليه واتساب." });
  }
  if (!value.hasWhatsapp && value.whatsappPhone) ensureDifferentPhones(value, context);
});

function ensureDifferentPhones(value, context) {
  try {
    const primary = normalizePhone(value.primaryPhone).e164;
    const whatsapp = normalizePhone(value.whatsappPhone).e164;
    if (primary === whatsapp) context.addIssue({ code: "custom", path: ["whatsappPhone"], message: "رقم الواتساب البديل يجب أن يكون مختلفاً." });
  } catch {
    // Field-specific phone validation reports the underlying error.
  }
}

function optionalNumber(min, max, message) {
  return z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : Number(value),
    z.number().int().min(min, message).max(max, message).optional(),
  );
}
