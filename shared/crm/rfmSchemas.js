// Validates editable, explainable RFM scoring thresholds.

import { z } from "zod";

const ascendingFour = z.array(z.coerce.number().nonnegative()).length(4).refine(
  (values) => values.every((value, index) => index === 0 || value > values[index - 1]),
  "يجب أن تكون الحدود الأربعة تصاعدية.",
);

export const rfmRulesSchema = z.object({
  recencyDays: ascendingFour,
  frequency: ascendingFour,
  monetary: ascendingFour,
});
