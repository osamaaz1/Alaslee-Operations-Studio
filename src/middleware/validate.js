// Applies Zod contracts at API boundaries and returns field-level errors.

import { AppError } from "../utils/errors.js";

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError("تحقق من البيانات المدخلة.", 422, result.error.flatten()));
    }
    req.validatedBody = result.data;
    return next();
  };
}
