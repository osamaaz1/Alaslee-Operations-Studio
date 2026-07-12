// Sends feedback records and private screenshot objects to Supabase over its REST APIs.

import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

export function supabaseFeedbackConfigured() {
  return Boolean(config.supabase.url && config.supabase.serverKey);
}

export async function uploadFeedbackAttachment(objectPath, attachment) {
  const path = storageObjectPath(objectPath);
  await supabaseRequest(`/storage/v1/object/${config.supabase.feedbackBucket}/${path}`, {
    method: "POST",
    headers: { "Content-Type": attachment.mimeType, "x-upsert": "false" },
    body: attachment.buffer,
  });
}

export async function insertFeedbackReport(report) {
  const response = await supabaseRequest("/rest/v1/feedback_reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(report),
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new AppError("لم يتم تأكيد حفظ التقرير في Supabase.", 502);
  return rows[0];
}

export async function deleteFeedbackAttachment(objectPath) {
  try {
    await supabaseRequest(`/storage/v1/object/${config.supabase.feedbackBucket}/${storageObjectPath(objectPath)}`, {
      method: "DELETE",
    });
  } catch {
    // The original database error remains more useful than a cleanup failure.
  }
}

async function supabaseRequest(path, options) {
  if (!supabaseFeedbackConfigured()) {
    throw new AppError("لم يتم ربط Supabase بعد. أضف الإعدادات ثم أعد تشغيل النظام.", 503);
  }
  const response = await fetch(`${config.supabase.url}${path}`, {
    ...options,
    headers: { apikey: config.supabase.serverKey, Authorization: `Bearer ${config.supabase.serverKey}`, ...options.headers },
  });
  if (!response.ok) throw new AppError("تعذر حفظ التقرير في Supabase. تحقق من الإعدادات والتهيئة.", 502);
  return response;
}

function storageObjectPath(objectPath) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}
