// Validates inbound images and normalizes generated image buffers.

import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "./errors.js";
import { REQUIRED_IMAGE_ROLES, SINGLE_UPLOAD_IMAGE_ROLES } from "../domain/imageRoles.js";

const acceptedMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const imageRoles = [...SINGLE_UPLOAD_IMAGE_ROLES];
export const requiredImageRoles = [...REQUIRED_IMAGE_ROLES];

export async function validateUploadedImage(file, role, maxImageBytes) {
  if (!file) {
    throw new AppError(`Missing image for ${role}.`, 400);
  }

  if (file.size <= 0) {
    throw new AppError(`${role} image is empty.`, 400);
  }

  if (file.size > maxImageBytes) {
    throw new AppError(`${role} image exceeds the maximum size.`, 400, {
      maxBytes: maxImageBytes,
      actualBytes: file.size,
    });
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !acceptedMimeTypes.has(detected.mime)) {
    throw new AppError(`${role} must be JPG, PNG, or WEBP.`, 400);
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, { failOn: "error" }).metadata();
  } catch {
    throw new AppError(`${role} is not a valid image file.`, 400);
  }

  if (!metadata.width || !metadata.height) {
    throw new AppError(`${role} image dimensions could not be read.`, 400);
  }

  return {
    role,
    extension: acceptedMimeTypes.get(detected.mime),
    mimeType: detected.mime,
    sizeBytes: file.size,
    width: metadata.width,
    height: metadata.height,
    buffer: file.buffer,
    originalName: file.originalname,
  };
}

export async function normalizeGeneratedPng(buffer, outputSize) {
  const normalized = await sharp(buffer, { failOn: "error" })
    .resize(outputSize, outputSize, {
      // Providers may return a landscape or portrait image when request size is
      // `auto`. `cover` silently removed the long edges while forcing that image
      // into our square ecommerce canvas. Eyewear is especially wide, so this
      // cropped temples and sometimes part of the frame after a paid generation.
      // `contain` preserves every generated pixel and only adds white canvas.
      fit: "contain",
      position: "center",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
    mimeType: "image/png",
  };
}
