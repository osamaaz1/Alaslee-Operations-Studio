// Validates manual sale inputs before authoritative product checks.

import { z } from "zod";

export const saleCreateSchema = z.object({
  customerId: z.string().uuid("اختر عميلاً صالحاً."),
  occurredAt: z.string().datetime().optional(),
  initialPaidAmount: z.coerce.number().nonnegative("المبلغ المدفوع غير صالح.").default(0),
  deliveryMode: z.enum(["immediate", "scheduled"]).default("immediate"),
  scheduledDeliveryAt: z.string().datetime().optional(),
  warningReason: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive("الكمية يجب أن تكون رقماً صحيحاً موجباً."),
    unitPrice: z.coerce.number().nonnegative("السعر غير صالح."),
  })).min(1, "أضف منتجاً واحداً على الأقل.").max(50),
}).superRefine((value, context) => {
  if (value.deliveryMode === "scheduled" && !value.scheduledDeliveryAt) {
    context.addIssue({ code: "custom", path: ["scheduledDeliveryAt"], message: "حدد موعد تسليم الطلب." });
  }
  if (value.scheduledDeliveryAt && value.occurredAt && new Date(value.scheduledDeliveryAt) < new Date(value.occurredAt)) {
    context.addIssue({ code: "custom", path: ["scheduledDeliveryAt"], message: "موعد التسليم يجب ألا يسبق وقت البيع." });
  }
});

export const salePaymentSchema = z.object({
  amount: z.coerce.number().positive("مبلغ الدفعة يجب أن يكون أكبر من صفر."),
  occurredAt: z.string().datetime().optional(),
});

export const saleRefundSchema = salePaymentSchema.extend({
  reason: z.string().trim().min(3, "سبب رد المبلغ مطلوب.").max(500),
});

export const saleDeliverySchema = z.object({
  status: z.enum(["pending", "ready", "delivered"]),
  scheduledDeliveryAt: z.string().datetime().optional(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
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
