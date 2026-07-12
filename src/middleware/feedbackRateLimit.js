// Adds a narrow rate limit to the anonymous Feedback submission endpoint.

import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const buckets = new Map();

export function feedbackRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = activeBucket(key, now);
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > config.supabase.feedbackRateLimitMax) {
    return next(new AppError("تم تجاوز الحد المؤقت لإرسال الملاحظات. حاول لاحقًا.", 429));
  }
  return next();
}

function activeBucket(key, now) {
  const existing = buckets.get(key);
  if (existing?.resetAt > now) return existing;
  return { count: 0, resetAt: now + config.supabase.feedbackRateLimitWindowMs };
}
