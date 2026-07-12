// Defines the fixed feedback categories and priorities shared by API and UI.

export const FEEDBACK_KINDS = [
  { code: "bug", label: "خطأ في النظام" },
  { code: "suggestion", label: "اقتراح تحسين" },
  { code: "report", label: "تقرير تفصيلي" },
];

export const FEEDBACK_PRIORITIES = [
  { code: "low", label: "منخفضة" },
  { code: "normal", label: "عادية" },
  { code: "high", label: "عالية" },
  { code: "critical", label: "حرجة" },
];

export const FEEDBACK_ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
