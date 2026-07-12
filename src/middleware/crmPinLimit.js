// Limits repeated local PIN attempts independently from the general API limit.

import { AppError } from "../utils/errors.js";

const attempts = new Map();
const windowMs = 15 * 60_000;
const maximumAttempts = 5;

export function crmPinRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = attempts.get(key);
  const current = bucket?.resetAt > now ? bucket : { count: 0, resetAt: now + windowMs };
  current.count += 1;
  attempts.set(key, current);
  if (current.count > maximumAttempts) {
    return next(new AppError("تم إيقاف محاولات الدخول مؤقتاً. حاول بعد 15 دقيقة.", 429));
  }
  return next();
}

export function clearCrmPinAttempts(req) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  attempts.delete(key);
}
