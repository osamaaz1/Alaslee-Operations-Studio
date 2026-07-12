// Validates anonymous feedback metadata before it reaches the storage service.

import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_PRIORITIES } from "./feedbackConstants.js";

const kindCodes = FEEDBACK_KINDS.map((item) => item.code);
const priorityCodes = FEEDBACK_PRIORITIES.map((item) => item.code);

export const feedbackReportSchema = z.object({
  kind: z.enum(kindCodes),
  priority: z.enum(priorityCodes),
  title: z.string().trim().min(3, "اكتب عنوانًا لا يقل عن 3 أحرف.").max(160),
  description: z.string().trim().min(10, "اكتب وصفًا أوضح لا يقل عن 10 أحرف.").max(5000),
  pagePath: z.string().trim().max(500).regex(/^\//, "مسار الصفحة غير صالح.").optional().or(z.literal("")),
});
