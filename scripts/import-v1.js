import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const args = new Set(process.argv.slice(2));
const sourceIndex = process.argv.indexOf("--source");
const sourceValue = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "";
const apply = args.has("--apply");
const dryRun = args.has("--dry-run") || !apply;
const target = process.cwd();

if (!sourceValue) fail("استخدم --source لتحديد مجلد مستودع V1.");

const source = path.resolve(sourceValue);
if (source === target) fail("مصدر V1 لا يمكن أن يكون مستودع V2 نفسه.");

const sourceStat = await statOrNull(source);
if (!sourceStat?.isDirectory()) fail(`المسار المصدر غير صالح: ${source}`);

const paths = [
  ["data", "data"],
  ["uploads", "uploads"],
  ["OriginalEye-Data-Analysis", "OriginalEye-Data-Analysis"],
];
const available = [];
for (const [from, to] of paths) {
  const fullSource = path.join(source, from);
  const stat = await statOrNull(fullSource);
  if (stat) available.push({ from, to, fullSource, kind: stat.isDirectory() ? "directory" : "file" });
}

const fingerprint = crypto.createHash("sha256").update(`${source}:${available.map((item) => item.from).join(",")}`).digest("hex");
const manifestPath = path.join(target, ".migration", "v1-import.json");
const prior = await readJson(manifestPath);
if (prior?.source === source && prior?.fingerprint === fingerprint) {
  fail("تم استيراد هذا المصدر سابقاً. لن يكرر V2 البيانات أو الأصول.");
}

const report = {
  mode: dryRun ? "dry-run" : "apply",
  source,
  target,
  copies: available.map(({ from, to, kind }) => ({ from, to, kind })),
  excludes: [".env", ".env.*", "node_modules", ".git"],
};

if (dryRun) {
  console.log(JSON.stringify(report, null, 2));
  console.log("لم تُكتب أي ملفات. أضف --apply لتنفيذ الاستيراد بعد المراجعة.");
  process.exit(0);
}

for (const entry of available) {
  const destination = path.join(target, entry.to);
  if (await statOrNull(destination)) {
    const backupRoot = path.join(target, ".migration", "backups", new Date().toISOString().replace(/[:.]/g, "-"));
    await fs.mkdir(backupRoot, { recursive: true });
    await fs.rename(destination, path.join(backupRoot, entry.to));
  }
  await fs.cp(entry.fullSource, destination, {
    recursive: entry.kind === "directory",
    force: false,
    errorOnExist: true,
    filter: (candidate) => !isExcluded(candidate),
  });
}

rewriteDatabasePaths(path.join(target, "data", "products.sqlite"), source, target);
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify({ ...report, fingerprint, importedAt: new Date().toISOString() }, null, 2));
console.log("اكتمل استيراد V1 بنجاح. لم يتم نسخ أي ملف إعدادات أو أسرار.");

function isExcluded(candidate) {
  const name = path.basename(candidate);
  return name !== ".git" && name !== "node_modules" && name !== ".env" && !name.startsWith(".env.");
}

function rewriteDatabasePaths(databasePath, sourceRoot, targetRoot) {
  try {
    const db = new Database(databasePath);
    const replacements = [
      ["product_original_images", "path"],
      ["product_generated_images", "path"],
      ["product_instagram_images", "path"],
      ["product_instagram_images", "local_path"],
      ["product_instagram_images", "price_label_reference_path"],
      ["instagram_generation_attempts", "local_path"],
      ["instagram_generation_attempts", "final_path"],
      ["instagram_generation_attempts", "price_label_reference_path"],
    ];
    db.transaction(() => {
      for (const [table, column] of replacements) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
        if (columns.includes(column)) db.prepare(`UPDATE ${table} SET ${column} = REPLACE(${column}, ?, ?) WHERE ${column} LIKE ?`).run(sourceRoot, targetRoot, `${sourceRoot}%`);
      }
    })();
    db.close();
  } catch (error) {
    console.warn(`لم يُعدّل مسار قاعدة البيانات: ${error.message}`);
  }
}

async function statOrNull(value) { try { return await fs.stat(value); } catch { return null; } }
async function readJson(value) { try { return JSON.parse(await fs.readFile(value, "utf8")); } catch { return null; } }
function fail(message) { console.error(message); process.exit(1); }
