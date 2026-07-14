// Creates or verifies a consistent SQLite backup using SQLite's online backup API.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs/promises";

const [command, source, destination] = process.argv.slice(2);
if (!new Set(["backup", "verify"]).has(command) || !source) {
  throw new Error("Usage: node scripts/sqlite-backup.js <backup|verify> <source> [destination]");
}

if (command === "backup") {
  if (!destination) throw new Error("A destination path is required for backup.");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
  } finally {
    database.close();
  }
  console.log(`SQLite backup created: ${destination}`);
} else {
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    const foreignKeyErrors = database.pragma("foreign_key_check").length;
    if (quickCheck !== "ok" || foreignKeyErrors !== 0) throw new Error("SQLite integrity verification failed.");
    console.log(JSON.stringify({ ok: true, quickCheck, foreignKeyErrors }));
  } finally {
    database.close();
  }
}
