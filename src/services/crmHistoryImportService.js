// Imports trusted local customer and invoice exports into reviewable CRM history.

import path from "node:path";
import fs from "node:fs";
import * as xlsx from "xlsx";
import { config } from "../config.js";
import { blindIndex, encryptJson } from "../infra/crm/cryptoVault.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { normalizePhone } from "../../shared/crm/phone.js";
import { AppError } from "../utils/errors.js";
import { writeAudit } from "./crmAuditService.js";
import { recalculateCustomersRfm } from "./crmRfmService.js";
import { customerCreateSchema } from "../../shared/crm/customerSchemas.js";

const clientFile = "Clients.csv";
const invoiceFile = "Invoices.csv";
xlsx.set_fs(fs);

// Imports a user-supplied CSV/XLSX customer file. Validation is performed for every
// row and dry-run can be used to preview errors before any database writes occur.
export async function importCustomerFile(file, actor, ipAddress, { dryRun = false } = {}) {
  if (!file?.buffer) throw new AppError("أرفق ملف CSV أو Excel.", 400);
  let rows;
  try {
    const workbook = xlsx.read(file.buffer, { type: "buffer", raw: false, cellDates: false });
    rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false, blankrows: false });
  } catch (error) {
    throw new AppError(`تعذر قراءة ملف الاستيراد: ${error.message}`, 422);
  }
  if (rows.length > 5000) throw new AppError("الحد الأقصى للاستيراد هو 5000 عميل في الملف الواحد.", 422);
  const valid = []; const errors = [];
  rows.forEach((row, i) => {
    const input = mapCustomerRow(row);
    const parsed = customerCreateSchema.safeParse(input);
    if (!parsed.success) errors.push({ row: i + 2, errors: parsed.error.issues.map((e) => e.message), name: input.name || "" });
    else valid.push({ row: i + 2, input: parsed.data });
  });
  if (dryRun) return { dryRun: true, total: rows.length, valid: valid.length, invalid: errors.length, errors };
  let imported = 0; const failed = [...errors];
  for (const item of valid) {
    try { await createCustomer(item.input, actor, ipAddress); imported += 1; }
    catch (error) { failed.push({ row: item.row, errors: [error.message], name: item.input.name }); }
  }
  return { dryRun: false, total: rows.length, imported, invalid: failed.length, errors: failed };
}

function mapCustomerRow(row) {
  const value = (...keys) => keys.map((k) => row[k]).find((v) => v !== undefined && String(v).trim() !== "") ?? "";
  const phone = value("primaryPhone", "phone", "Phone", "mobile", "رقم الهاتف");
  const whatsapp = value("whatsappPhone", "whatsapp", "WhatsApp");
  const hasWhatsappRaw = value("hasWhatsapp", "عليه الواتساب");
  const hasWhatsapp = hasWhatsappRaw === "" ? true : !["false", "no", "لا", "0"].includes(String(hasWhatsappRaw).toLowerCase());
  const address = {
    buildingNumber: String(value("buildingNumber", "رقم المبنى")), streetName: String(value("streetName", "street", "اسم الشارع")),
    secondaryNumber: String(value("secondaryNumber", "الرقم الثانوي")), district: String(value("district", "الحي")),
    city: String(value("city", "المدينة")), postalCode: String(value("postalCode", "الرمز البريدي")),
    shortAddress: String(value("shortAddress", "العنوان المختصر")), countryCode: "SA",
  };
  const hasAddress = Object.values(address).some((value) => value && value !== "SA");
  return {
    name: String(value("name", "Name", "اسم العميل", "BusinessName")).trim(),
    primaryPhone: { countryCode: value("countryCode", "CountryCode") || "SA", number: String(phone) },
    hasWhatsapp, whatsappPhone: hasWhatsapp ? null : (whatsapp ? { countryCode: "SA", number: String(whatsapp) } : null),
    identityNumber: String(value("identityNumber", "identity", "رقم الهوية")),
    birthYear: value("birthYear", "birth_year", "سنة الميلاد"), sourceCode: String(value("sourceCode", "source", "مصدر العميل") || "other"), address: hasAddress ? address : null,
  };
}


export async function importCrmHistory(actor, ipAddress) {
  const clients = readRows(path.join(config.dataWorkspaceDir, clientFile));
  const invoices = readRows(path.join(config.dataWorkspaceDir, invoiceFile));
  return withCrmTransaction(actor, async (db) => {
    const batch = await createBatch(db, actor.id);
    const sourceId = await sourceIdForImport(db);
    const prepared = prepareClients(clients, sourceId, actor.id);
    await insertCustomers(db, prepared.valid);
    const customerMap = await customerMapByHash(db, prepared.valid);
    const clientMap = mapClientNumbers(prepared.valid, customerMap);
    const importedSales = await insertInvoices(db, batch.id, invoices, clientMap, actor.id);
    await insertCandidates(db, batch.id, prepared.invalid, actor.id);
    await writeImportRows(db, batch.id, prepared.valid, clientMap, actor.id);
    await recalculateImportedCustomers(db, new Set(clientMap.values()), actor.id);
    const status = prepared.invalid.length ? "review" : "completed";
    await completeBatch(db, batch.id, status, clientMap.size, importedSales, prepared.invalid.length);
    await writeAudit(db, actor, "history.import", "import_batch", batch.id, { customers: clientMap.size, sales: importedSales }, ipAddress);
    return { id: batch.id, status, customers: clientMap.size, sales: importedSales, reviewCandidates: prepared.invalid.length };
  });
}

export async function listImportBatches(actor) {
  return withCrmTransaction(actor, async (db) => {
    const result = await db.query(
      `SELECT id,status,source_path,customers_count,sales_count,candidates_count,error_message,created_at,updated_at
       FROM crm_import_batches ORDER BY created_at DESC LIMIT 50`,
    );
    return result.rows;
  });
}

export async function listMergeCandidates(actor, status = "pending") {
  const sourcePhones = sourcePhonesByClientNumber();
  return withCrmTransaction(actor, async (db) => {
    const result = await db.query(
      `SELECT m.id,m.batch_id,m.source_key,m.confidence,m.evidence,m.status,m.candidate_customer_id,
              c.name AS customer_name,m.created_at,m.updated_at
       FROM crm_merge_candidates m LEFT JOIN crm_customers c ON c.id=m.candidate_customer_id
       WHERE ($1='' OR m.status=$1) ORDER BY m.created_at DESC LIMIT 200`, [status],
    );
    return result.rows.map((row) => ({
      ...row,
      evidence: { ...row.evidence, phone: row.evidence?.phone ?? sourcePhones.get(row.source_key) ?? "" },
    }));
  });
}

export async function resolveMergeCandidate(candidateId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (db) => {
    const candidate = await requireCandidate(db, candidateId);
    let importedSales = 0;
    if (input.status === "merged") {
      await requireActiveCustomer(db, input.customerId);
      const invoices = readRows(path.join(config.dataWorkspaceDir, invoiceFile));
      importedSales = await insertInvoices(db, candidate.batch_id, invoices, new Map([[candidate.source_key, input.customerId]]), actor.id);
      await recalculateImportedCustomers(db, new Set([input.customerId]), actor.id);
    }
    await db.query(
      `UPDATE crm_merge_candidates SET status=$1,candidate_customer_id=$2,updated_at=now(),updated_by=$3 WHERE id=$4`,
      [input.status, input.customerId || null, actor.id, candidateId],
    );
    await completeReviewedBatch(db, candidate.batch_id, actor.id);
    await writeAudit(db, actor, "import.candidate.resolve", "import_batch", candidate.batch_id,
      { candidateId, status: input.status, customerId: input.customerId || null, importedSales }, ipAddress);
    return { id: candidateId, status: input.status, customerId: input.customerId || null, importedSales };
  });
}

function readRows(filePath) {
  try {
    const workbook = xlsx.readFile(filePath, { raw: false, cellDates: false, dense: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false, blankrows: false });
  } catch (error) {
    throw new AppError(`تعذر قراءة ملف الاستيراد ${path.basename(filePath)}: ${error.message}`, 422);
  }
}

async function createBatch(db, actor) {
  const result = await db.query(
    `INSERT INTO crm_import_batches(status,source_path,created_by,updated_by)
     VALUES('running',$1,$2,$2) RETURNING id`, [config.dataWorkspaceDir, actor],
  );
  return result.rows[0];
}

async function sourceIdForImport(db) {
  const result = await db.query("SELECT id FROM crm_customer_sources WHERE code='other'");
  return result.rows[0].id;
}

function prepareClients(rows, sourceId, actor) {
  const valid = [];
  const invalid = [];
  rows.forEach((row, index) => {
    const sourceKey = clean(row.ClientNumber) || `row-${index + 2}`;
    const name = clean(row.BusinessName || `${row.FirstName || ""} ${row.LastName || ""}`) || `عميل ${sourceKey}`;
    const rawPhone = clean(row.Phone1 || row.mobile || row.HomePhone);
    try {
      const phone = normalizePhone({ countryCode: "SA", number: rawPhone });
      valid.push({ sourceKey, name, phone, sourceId, actor, rowNumber: index + 2 });
    } catch {
      invalid.push({ sourceKey, name, rawPhone, reason: "رقم الهاتف مفقود أو غير صالح", rowNumber: index + 2 });
    }
  });
  return { valid, invalid };
}

async function insertCustomers(db, rows) {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    name: row.name, phone_country: row.phone.countryCode, phone_cipher: encryptJson({ e164: row.phone.e164, countryCode: row.phone.countryCode }),
    phone_hash: blindIndex(row.phone.e164), phone_last4: row.phone.e164.slice(-4), source_id: row.sourceId, actor: row.actor,
  }));
  await db.query(
    `INSERT INTO crm_customers(name,phone_country,phone_cipher,phone_hash,phone_last4,has_whatsapp,
       whatsapp_cipher,whatsapp_hash,whatsapp_last4,source_id,created_by,updated_by)
     SELECT x.name,x.phone_country,x.phone_cipher,x.phone_hash,x.phone_last4,true,
       x.phone_cipher,x.phone_hash,x.phone_last4,x.source_id::uuid,x.actor,x.actor
     FROM jsonb_to_recordset($1::jsonb) AS x(name text,phone_country text,phone_cipher text,phone_hash text,phone_last4 text,source_id text,actor text)
     ON CONFLICT(phone_hash) DO NOTHING`, [JSON.stringify(payload)],
  );
}

async function customerMapByHash(db, rows) {
  const hashes = [...new Set(rows.map((row) => blindIndex(row.phone.e164)))];
  if (!hashes.length) return new Map();
  const result = await db.query("SELECT id,phone_hash FROM crm_customers WHERE phone_hash=ANY($1::text[])", [hashes]);
  return new Map(result.rows.map((row) => [row.phone_hash, row.id]));
}

function mapClientNumbers(rows, customers) {
  const result = new Map();
  rows.forEach((row) => {
    const customerId = customers.get(blindIndex(row.phone.e164));
    if (customerId) result.set(row.sourceKey, customerId);
  });
  return result;
}

async function insertInvoices(db, batchId, invoices, clientMap, actor) {
  const rows = invoices.map((row, index) => invoicePayload(row, index, clientMap, actor)).filter(Boolean);
  if (!rows.length) return 0;
  const inserted = await db.query(
    `INSERT INTO crm_sales(customer_id,record_type,occurred_at,total_amount,source_reference,created_by,updated_by)
     SELECT x.customer_id::uuid,x.record_type,COALESCE(x.occurred_at::timestamptz,now()),x.total_amount::numeric,x.source_key,x.actor,x.actor
     FROM jsonb_to_recordset($1::jsonb) AS x(customer_id text,record_type text,occurred_at text,total_amount text,actor text,source_key text)
     ON CONFLICT(source_reference) WHERE source_reference IS NOT NULL DO NOTHING
     RETURNING id,customer_id,source_reference`, [JSON.stringify(rows)],
  );
  const totals = new Map(rows.map((row) => [row.source_key, row.total_amount]));
  const importRows = inserted.rows.map((sale) => ({
    source_type: "invoice", source_key: sale.source_reference, source_payload: { total: totals.get(sale.source_reference) },
    target_customer_id: sale.customer_id, target_sale_id: sale.id, actor,
  }));
  await insertImportRows(db, batchId, importRows);
  return inserted.rowCount;
}

function invoicePayload(row, index, clientMap, actor) {
  const clientNo = clean(row.ClientNo);
  const customerId = clientMap.get(clientNo);
  if (!customerId) return null;
  const total = number(row.SummaryTotal);
  return {
    customer_id: customerId, record_type: total < 0 ? "imported_return" : "imported_sale",
    occurred_at: isoDate(row.Date), total_amount: String(total), actor,
    source_key: clean(row.InvoiceNo) || `invoice-row-${index + 2}`,
  };
}

async function insertCandidates(db, batchId, rows, actor) {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    source_key: row.sourceKey,
    name: row.name,
    phone: row.rawPhone,
    reason: row.reason,
    row_number: row.rowNumber,
    actor,
  }));
  await db.query(
    `INSERT INTO crm_merge_candidates(batch_id,source_key,confidence,evidence,status,created_by,updated_by)
     SELECT $1,x.source_key,0,jsonb_build_object('name',x.name,'phone',x.phone,'reason',x.reason,'rowNumber',x.row_number),'pending',x.actor,x.actor
     FROM jsonb_to_recordset($2::jsonb) AS x(source_key text,name text,phone text,reason text,row_number int,actor text)
     ON CONFLICT(batch_id,source_key,candidate_customer_id) DO NOTHING`, [batchId, JSON.stringify(payload)],
  );
}

async function writeImportRows(db, batchId, rows, clientMap, actor) {
  const payload = rows.map((row) => ({
    source_type: "client", source_key: row.sourceKey, source_payload: { name: row.name, rowNumber: row.rowNumber },
    target_customer_id: clientMap.get(row.sourceKey), target_sale_id: null, actor,
  }));
  await insertImportRows(db, batchId, payload);
}

async function insertImportRows(db, batchId, rows) {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO crm_import_rows(batch_id,source_type,source_key,source_payload,target_customer_id,target_sale_id,created_by)
     SELECT $1,x.source_type,x.source_key,x.source_payload,x.target_customer_id::uuid,NULLIF(x.target_sale_id,'')::uuid,x.actor
     FROM jsonb_to_recordset($2::jsonb) AS x(source_type text,source_key text,source_payload jsonb,target_customer_id text,target_sale_id text,actor text)
     ON CONFLICT(batch_id,source_type,source_key) DO NOTHING`, [batchId, JSON.stringify(rows)],
  );
}

async function recalculateImportedCustomers(db, customerIds, actor) {
  await recalculateCustomersRfm(db, [...customerIds], actor);
}

async function completeBatch(db, id, status, customers, sales, candidates) {
  await db.query(
    `UPDATE crm_import_batches SET status=$2,customers_count=$3,sales_count=$4,candidates_count=$5,
     updated_at=now(),updated_by='history-import' WHERE id=$1`, [id, status, customers, sales, candidates],
  );
}

async function requireCandidate(db, id) {
  const result = await db.query("SELECT id,batch_id,source_key,status FROM crm_merge_candidates WHERE id=$1", [id]);
  if (!result.rows[0]) throw new AppError("سجل المراجعة غير موجود.", 404);
  if (result.rows[0].status !== "pending") throw new AppError("تمت مراجعة هذا السجل مسبقاً.", 409);
  return result.rows[0];
}

async function requireActiveCustomer(db, id) {
  const result = await db.query("SELECT id FROM crm_customers WHERE id=$1 AND deleted_at IS NULL", [id]);
  if (!result.rows[0]) throw new AppError("العميل المحدد غير موجود.", 422);
}

async function completeReviewedBatch(db, batchId, actor) {
  const result = await db.query(
    "SELECT COUNT(*)::int AS pending FROM crm_merge_candidates WHERE batch_id=$1 AND status='pending'", [batchId],
  );
  if (result.rows[0].pending) return;
  await db.query(
    "UPDATE crm_import_batches SET status='completed',updated_at=now(),updated_by=$2 WHERE id=$1", [batchId, actor],
  );
}

function clean(value) { return String(value ?? "").trim(); }
function sourcePhonesByClientNumber() {
  try {
    return new Map(readRows(path.join(config.dataWorkspaceDir, clientFile)).map((row, index) => [
      clean(row.ClientNumber) || `row-${index + 2}`,
      clean(row.Phone1 || row.mobile || row.HomePhone),
    ]));
  } catch {
    return new Map();
  }
}
function number(value) { const parsed = Number(clean(value).replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function isoDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
