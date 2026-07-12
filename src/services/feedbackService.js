// Validates and persists one global studio feedback report through Supabase only.

import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { FEEDBACK_ALLOWED_IMAGE_MIME_TYPES } from "../../shared/feedback/feedbackConstants.js";
import { config } from "../config.js";
import {
  deleteFeedbackAttachment, insertFeedbackReport, supabaseFeedbackConfigured, uploadFeedbackAttachment,
} from "../infra/supabase/feedbackGateway.js";
import { AppError } from "../utils/errors.js";

export function feedbackStatus() {
  return { configured: supabaseFeedbackConfigured(), maxImageBytes: config.supabase.feedbackMaxImageBytes };
}

export async function submitFeedback(input, file) {
  if (!supabaseFeedbackConfigured()) throw new AppError("ربط Supabase مطلوب لإرسال التقرير.", 503);
  const attachment = await validateAttachment(file);
  const id = randomUUID();
  const objectPath = attachment ? feedbackObjectPath(id, attachment.extension) : null;
  if (attachment) await uploadFeedbackAttachment(objectPath, attachment);
  try {
    const saved = await insertFeedbackReport(reportRecord(id, input, objectPath, attachment));
    return { id: saved.id, status: saved.status, receivedAt: saved.created_at, hasImage: Boolean(objectPath) };
  } catch (error) {
    if (objectPath) await deleteFeedbackAttachment(objectPath);
    throw error;
  }
}

async function validateAttachment(file) {
  if (!file) return null;
  if (!file.buffer?.length || file.size > config.supabase.feedbackMaxImageBytes) {
    throw new AppError("الصورة المرفقة غير صالحة أو تتجاوز الحجم المسموح.", 400);
  }
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !FEEDBACK_ALLOWED_IMAGE_MIME_TYPES.includes(detected.mime)) {
    throw new AppError("الصورة يجب أن تكون JPG أو PNG أو WEBP.", 400);
  }
  return { buffer: file.buffer, mimeType: detected.mime, extension: detected.ext };
}

function feedbackObjectPath(id, extension) {
  return `reports/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
}

function reportRecord(id, input, objectPath, attachment) {
  return {
    id, kind: input.kind, priority: input.priority, title: input.title, description: input.description,
    page_path: input.pagePath || null, image_object_path: objectPath, image_content_type: attachment?.mimeType || null,
    created_by: "feedback-widget", updated_by: "feedback-widget",
  };
}
