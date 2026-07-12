// Scans a local folder and groups product images by batch filename rules.

import fs from "node:fs/promises";
import path from "node:path";
import {
  BATCH_FILENAME_PATTERN,
  REQUIRED_IMAGE_ROLES,
  SUPPORTED_IMAGE_EXTENSIONS,
  roleFromBatchIndex,
} from "../domain/imageRoles.js";

export async function scanBatchFolder(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const groups = new Map();
  const skippedFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const parsed = parseBatchFilename(entry.name);
    if (!parsed) {
      skippedFiles.push({ filename: entry.name, reason: "Unsupported batch filename." });
      continue;
    }

    addFileToGroup(groups, folderPath, entry.name, parsed);
  }

  return {
    products: [...groups.values()].map(normalizeGroup),
    skippedFiles,
  };
}

export function parseBatchFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) return undefined;

  const match = BATCH_FILENAME_PATTERN.exec(filename);
  if (!match) return undefined;

  const imageIndex = Number.parseInt(match[2], 10);
  if (!Number.isInteger(imageIndex) || imageIndex < 1) return undefined;

  return {
    productCode: match[1],
    imageIndex,
    role: roleFromBatchIndex(imageIndex),
  };
}

function addFileToGroup(groups, folderPath, filename, parsed) {
  if (!groups.has(parsed.productCode)) {
    groups.set(parsed.productCode, {
      productCode: parsed.productCode,
      files: [],
    });
  }

  groups.get(parsed.productCode).files.push({
    filename,
    path: path.join(folderPath, filename),
    role: parsed.role,
    imageIndex: parsed.imageIndex,
  });
}

function normalizeGroup(group) {
  const files = group.files.sort((a, b) => a.imageIndex - b.imageIndex);
  const roles = new Set(files.map((file) => file.role));

  return {
    productCode: group.productCode,
    files,
    isComplete: REQUIRED_IMAGE_ROLES.every((role) => roles.has(role)),
    hasDuplicateRoles: files.length !== roles.size,
  };
}
