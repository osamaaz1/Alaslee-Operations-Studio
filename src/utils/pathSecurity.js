// Resolves and validates local filesystem paths against allowed roots.

import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors.js";

export async function resolveAllowedDirectory(inputPath, allowedRoots) {
  const resolvedPath = path.resolve(String(inputPath || "").trim());
  if (!isInsideAllowedRoots(resolvedPath, allowedRoots)) {
    throw new AppError("Folder path is outside the allowed import roots.", 403);
  }

  const stats = await statDirectory(resolvedPath);
  if (!stats.isDirectory()) {
    throw new AppError("Folder path must point to a directory.", 400);
  }

  return resolvedPath;
}

export function isInsideAllowedRoots(candidatePath, allowedRoots) {
  return allowedRoots.some((root) => isInsideRoot(candidatePath, root));
}

async function statDirectory(directoryPath) {
  try {
    return await fs.stat(directoryPath);
  } catch {
    throw new AppError("Folder path does not exist.", 404);
  }
}

function isInsideRoot(candidatePath, rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
