// Validates encrypted store-account vault writes at the API boundary.

import { z } from "zod";
import { ACCOUNT_CREDENTIAL_KINDS, ACCOUNT_PROVIDER_OPTIONS } from "./accountVaultConstants.js";

const providerCodes = ACCOUNT_PROVIDER_OPTIONS.map((item) => item.code);
const credentialKinds = ACCOUNT_CREDENTIAL_KINDS.map((item) => item.code);
const text = (limit) => z.string().trim().max(limit).optional().nullable().transform((value) => value || null);

const fields = {
  providerCode: z.enum(providerCodes),
  providerLabelAr: text(80),
  accountLabel: z.string().trim().min(2, "اكتب اسمًا واضحًا للحساب.").max(160),
  credentialKind: z.enum(credentialKinds),
  login: text(320),
  secret: z.string().min(1, "أدخل كلمة المرور أو بيانات الدخول.").max(2000),
  url: z.string().trim().url("أدخل رابطًا صالحًا.").max(500).optional().or(z.literal("")),
  notes: text(1000),
};

export const accountVaultCreateSchema = z.object(fields).superRefine(requireCustomProviderLabel);

export const accountVaultUpdateSchema = z.object({
  ...fields,
  secret: z.string().min(1).max(2000).optional(),
}).superRefine(requireCustomProviderLabel);

function requireCustomProviderLabel(value, context) {
  if (value.providerCode === "other" && !value.providerLabelAr) {
    context.addIssue({ code: "custom", path: ["providerLabelAr"], message: "اكتب اسم الخدمة أو الحساب." });
  }
}
