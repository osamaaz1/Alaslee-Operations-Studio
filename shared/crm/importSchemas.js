// Validates explicit superuser decisions for historical import review records.

import { z } from "zod";

export const mergeCandidateDecisionSchema = z.object({
  status: z.enum(["merged", "separate", "ignored"]),
  customerId: z.string().uuid("اختر عميلاً صالحاً.").optional().nullable(),
}).superRefine((value, context) => {
  if (value.status === "merged" && !value.customerId) {
    context.addIssue({ code: "custom", path: ["customerId"], message: "اختر العميل المراد ربط السجل به." });
  }
});
