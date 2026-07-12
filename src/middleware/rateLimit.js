// Applies a small in-memory rate limit for local API protection.

import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const buckets = new Map();

export function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = getBucket(key, now);

  bucket.count += 1;
  if (bucket.count > config.security.rateLimitMax) {
    return next(new AppError("Too many requests. Try again shortly.", 429));
  }

  buckets.set(key, bucket);
  return next();
}

function getBucket(key, now) {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;

  return {
    count: 0,
    resetAt: now + config.security.rateLimitWindowMs,
  };
}
