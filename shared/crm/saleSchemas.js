// Validates manual sale inputs before authoritative product checks.

import { z } from "zod";

export const saleCreateSchema = z.object({
  customerId: z.string().uuid("اختر عميلاً صالحاً."),
  occurredAt: z.string().datetime().optional(),
  warningReason: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive("الكمية يجب أن تكون رقماً صحيحاً موجباً."),
    unitPrice: z.coerce.number().nonnegative("السعر غير صالح."),
  })).min(1, "أضف منتجاً واحداً على الأقل.").max(50),
});

export const saleCorrectionSchema = z.object({
  action: z.enum(["edit", "void", "delete", "restore"]),
  reason: z.string().trim().min(3, "سبب التعديل مطلوب.").max(500),
  replacement: saleCreateSchema.optional(),
}).superRefine((value, context) => {
  if (value.action === "edit" && !value.replacement) {
    context.addIssue({ code: "custom", path: ["replacement"], message: "بيانات العملية البديلة مطلوبة." });
  }
});
