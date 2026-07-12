import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeFileEnsured(filePath, buffer) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
}

export async function fileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

export async function removeFilesBestEffort(filePaths, keepPaths = []) {
  const keep = new Set(keepPaths.map((filePath) => path.resolve(filePath)));
  for (const filePath of filePaths) {
    if (!filePath || keep.has(path.resolve(filePath))) continue;
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn(`[storage] could not remove stale file ${filePath}: ${error.message}`);
      }
    }
  }
}
