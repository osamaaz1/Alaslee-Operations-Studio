// Applies user-approved product name merges directly to OriginalEye invoice item exports.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { getProductMergeRows } from "./dataWorkspaceService.js";

const invoiceItemsFile = "Invoice_items.csv";

export async function mergeProductRows(input = {}, options = {}) {
  const dataRoot = options.dataRoot || config.dataWorkspaceDir;
  const filePath = path.join(dataRoot, invoiceItemsFile);
  const rowsSource = options.rows ? { rows: options.rows } : await getProductMergeRows();
  const source = rowFromInput(rowsSource.rows, input.sourceId, "Source product row not found.");
  const target = rowFromInput(rowsSource.rows, input.targetId, "Target product row not found.");
  const targetName = clean(input.targetName || target.name);
  const sourceNames = Array.isArray(input.sourceNames)
    ? input.sourceNames.map(clean).filter(Boolean)
    : source.sourceNames || [];

  if (!targetName) throw new AppError("Target product name is required.", 400);
  if (source.id && target.id && source.id === target.id) {
    throw new AppError("Choose two different product rows to merge.", 400);
  }
  if (sourceNames.length === 0) throw new AppError("Source product has no invoice item names to merge.", 400);

  const table = await readCsvTable(filePath);
  const itemIndex = table.headers.indexOf("item");
  if (itemIndex < 0) throw new AppError("Invoice_items.csv does not contain an item column.", 400);

  const sourceSet = new Set(sourceNames.map(clean));
  let changedRows = 0;
  for (const row of table.rows) {
    const item = clean(row[itemIndex]);
    if (!sourceSet.has(item)) continue;
    row[itemIndex] = targetName;
    changedRows += 1;
  }

  if (changedRows === 0) {
    throw new AppError("No invoice item rows matched the selected source product.", 400);
  }

  const backupPath = await backupFile(filePath);
  await fs.writeFile(filePath, stringifyCsv(table.headers, table.rows), "utf8");

  return {
    file: invoiceItemsFile,
    path: filePath,
    backupPath,
    changedRows,
    source: {
      id: source.id,
      name: source.name,
      sourceNames,
    },
    target: {
      id: target.id,
      name: targetName,
    },
  };
}

function rowFromInput(rows, rowId, message) {
  const id = clean(rowId);
  const row = rows.find((item) => item.id === id);
  if (!row) throw new AppError(message, 404);
  return row;
}

async function readCsvTable(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const matrix = csvRows(String(text || "").replace(/^\uFEFF/, ""));
  const headers = (matrix.shift() || []).map((header, index) => clean(header).replace(/^\uFEFF/, "") || `column_${index + 1}`);
  const rows = matrix.filter((row) => row.some((cell) => clean(cell)));
  return { headers, rows };
}

async function backupFile(filePath) {
  const backupPath = `${filePath}.bak-${timestamp()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

function stringifyCsv(headers, rows) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((_, index) => csvCell(row[index] ?? "")).join(",")),
  ].join("\r\n") + "\r\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function clean(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}
