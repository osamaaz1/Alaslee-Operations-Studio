// Encrypts sensitive CRM JSON and creates non-reversible exact-match indexes.

import crypto from "node:crypto";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

const algorithm = "aes-256-gcm";
let cachedKeys;

export function encryptJson(value) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptJson(payload) {
  if (!payload) return null;
  return decryptPayload(payload).value;
}

export function blindIndex(value) {
  return crypto.createHmac("sha256", encryptionKey()).update(String(value)).digest("hex");
}

function decryptPayload(payload) {
  const [ivValue, tagValue, dataValue] = String(payload).split(".");
  if (!ivValue || !tagValue || !dataValue) throw new AppError("تعذر قراءة البيانات المحمية.", 500);
  for (const [keyIndex, key] of encryptionKeys().entries()) {
    try {
      const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataValue, "base64url")), decipher.final()]);
      return { value: JSON.parse(decrypted.toString("utf8")), keyIndex };
    } catch {
      // A ciphertext is authenticated by AES-GCM; try an explicitly configured prior key next.
    }
  }
  throw new AppError("تعذر قراءة البيانات المحمية.", 500);
}

function encryptionKey() {
  return encryptionKeys()[0];
}

function encryptionKeys() {
  if (cachedKeys) return cachedKeys;
  const raw = String(config.crm.encryptionKey || "").trim();
  const primary = readKey(raw);
  if (!primary || primary.length !== 32) {
    throw new AppError("مفتاح تشفير بيانات العملاء غير مهيأ.", 503);
  }
  const previous = config.crm.encryptionPreviousKeys.map(readKey);
  if (previous.some((key) => !key || key.length !== 32)) {
    throw new AppError("أحد مفاتيح التشفير السابقة غير صالح.", 503);
  }
  cachedKeys = [primary, ...previous.filter((key) => !key.equals(primary))];
  return cachedKeys;
}

function readKey(raw) {
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}
