// Manages encrypted CRM customers, Saudi addresses, and optical records.

import { normalizePhone, tryNormalizePhone } from "../../shared/crm/phone.js";
import { identityType, validateSaudiIdentity } from "../../shared/crm/identity.js";
import { prescriptionExceptional } from "../../shared/crm/prescriptionSchemas.js";
import { blindIndex, decryptJson, encryptJson } from "../infra/crm/cryptoVault.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { AppError } from "../utils/errors.js";
import { writeAudit, listAuditEvents } from "./crmAuditService.js";
import XLSX from "xlsx";

const customerListLimit = 5_000;

export async function listCustomerSources(actor) {
  return withCrmTransaction(actor, async (client) => {
    const result = await client.query("SELECT code, label_ar FROM crm_customer_sources WHERE active = true ORDER BY created_at");
    return result.rows;
  });
}

export async function listCustomers(actor, query = "") {
  return withCrmTransaction(actor, async (client) => {
    const search = searchValues(query);
    const result = await client.query(
      `SELECT c.id, c.name, c.phone_last4, c.has_whatsapp, c.birth_year,
              s.code AS source_code, s.label_ar AS source_label,
              r.segment_code, r.segment_label_ar, r.explanation_ar, r.metrics
       FROM crm_customers c JOIN crm_customer_sources s ON s.id = c.source_id
       LEFT JOIN LATERAL (
         SELECT segment_code, segment_label_ar, explanation_ar, metrics
         FROM crm_rfm_snapshots WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1
       ) r ON true
       WHERE c.deleted_at IS NULL AND ($1 = '' OR lower(c.name) LIKE $2 OR c.phone_hash = $3 OR c.identity_hash = $4)
       ORDER BY c.updated_at DESC LIMIT $5`,
      [search.text, `%${search.text.toLowerCase()}%`, search.phoneHash, search.identityHash, customerListLimit],
    );
    return result.rows;
  });
}

export async function getCustomer(customerId, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const customer = await readCustomer(client, customerId);
    await writeAudit(client, actor, "customer.read", "customer", customerId, {}, ipAddress);
    return customer;
  });
}

export async function createCustomer(input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    try {
      const sourceId = await resolveSource(client, input.sourceCode);
      const protectedValues = protectCustomer(input);
      const result = await client.query(
        `INSERT INTO crm_customers(
           name, phone_country, phone_cipher, phone_hash, phone_last4, has_whatsapp,
           whatsapp_cipher, whatsapp_hash, whatsapp_last4, identity_type, identity_cipher,
           identity_hash, identity_last4, birth_year, source_id, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING id`,
        [input.name, protectedValues.phone.countryCode, protectedValues.phone.cipher, protectedValues.phone.hash,
          protectedValues.phone.last4, input.hasWhatsapp, protectedValues.whatsapp.cipher, protectedValues.whatsapp.hash,
          protectedValues.whatsapp.last4, protectedValues.identity.type, protectedValues.identity.cipher,
          protectedValues.identity.hash, protectedValues.identity.last4, input.birthYear || null, sourceId, actor.id],
      );
      const id = result.rows[0].id;
      if (input.address) await saveAddress(client, id, input.address, actor.id);
      if (input.prescription) await savePrescription(client, id, input.prescription, actor.id);
      await writeAudit(client, actor, "customer.create", "customer", id, { fields: Object.keys(input) }, ipAddress);
      return readCustomer(client, id);
    } catch (error) {
      throw customerError(error);
    }
  });
}

export async function updateCustomer(customerId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    await requireCustomer(client, customerId);
    const sourceId = await resolveSource(client, input.sourceCode);
    const values = protectCustomer(input);
    try {
      await client.query(
        `UPDATE crm_customers SET name=$1, phone_country=$2, phone_cipher=$3, phone_hash=$4,
         phone_last4=$5, has_whatsapp=$6, whatsapp_cipher=$7, whatsapp_hash=$8, whatsapp_last4=$9,
         identity_type=$10, identity_cipher=$11, identity_hash=$12, identity_last4=$13,
         birth_year=$14, source_id=$15, updated_at=now(), updated_by=$16 WHERE id=$17`,
        [input.name, values.phone.countryCode, values.phone.cipher, values.phone.hash, values.phone.last4,
          input.hasWhatsapp, values.whatsapp.cipher, values.whatsapp.hash, values.whatsapp.last4,
          values.identity.type, values.identity.cipher, values.identity.hash, values.identity.last4,
          input.birthYear || null, sourceId, actor.id, customerId],
      );
      if (input.address) await saveAddress(client, customerId, input.address, actor.id);
      else await client.query("DELETE FROM crm_customer_addresses WHERE customer_id = $1", [customerId]);
      await writeAudit(client, actor, "customer.update", "customer", customerId, { fields: Object.keys(input) }, ipAddress);
      return readCustomer(client, customerId);
    } catch (error) {
      throw customerError(error);
    }
  });
}

export async function addPrescription(customerId, prescription, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    await requireCustomer(client, customerId);
    const id = await savePrescription(client, customerId, prescription, actor.id);
    await writeAudit(client, actor, "prescription.create", "customer", customerId, { prescriptionId: id }, ipAddress);
    return readCustomer(client, customerId);
  });
}

export async function setCustomerDeleted(customerId, deleted, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    await requireCustomer(client, customerId, true);
    await client.query(
      `UPDATE crm_customers SET deleted_at=$1, deleted_by=$2, updated_at=now(), updated_by=$3 WHERE id=$4`,
      [deleted ? new Date() : null, deleted ? actor.id : null, actor.id, customerId],
    );
    await writeAudit(client, actor, deleted ? "customer.delete" : "customer.restore", "customer", customerId, {}, ipAddress);
    return { id: customerId, deleted };
  });
}

export async function customerAudit(customerId, actor) {
  return withCrmTransaction(actor, (client) => listAuditEvents(client, "customer", customerId));
}

/** Export customer records for the superuser. Sensitive values are decrypted only in memory. */
export async function exportCustomers(actor, query = "", format = "csv", ipAddress = null) {
  return withCrmTransaction(actor, async (client) => {
    const search = searchValues(query);
    const result = await client.query(
      `SELECT c.*, s.code AS source_code, s.label_ar AS source_label, a.address_cipher
         FROM crm_customers c JOIN crm_customer_sources s ON s.id = c.source_id
         LEFT JOIN crm_customer_addresses a ON a.customer_id = c.id
        WHERE c.deleted_at IS NULL AND ($1 = '' OR lower(c.name) LIKE $2 OR c.phone_hash = $3 OR c.identity_hash = $4)
        ORDER BY c.updated_at DESC`,
      [search.text, `%${search.text.toLowerCase()}%`, search.phoneHash, search.identityHash],
    );
    const ids = result.rows.map((row) => row.id);
    const prescriptions = ids.length
      ? await client.query("SELECT customer_id, exam_date, prescription_cipher, exceptional, exception_reason FROM crm_prescriptions WHERE customer_id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY exam_date DESC", [ids])
      : { rows: [] };
    const byCustomer = new Map();
    for (const item of prescriptions.rows) {
      const list = byCustomer.get(item.customer_id) || [];
      list.push({ examDate: item.exam_date, values: decryptJson(item.prescription_cipher), exceptional: item.exceptional, exceptionReason: item.exception_reason });
      byCustomer.set(item.customer_id, list);
    }
    const rows = result.rows.map((row) => {
      const phone = decryptJson(row.phone_cipher) || {};
      const whatsapp = decryptJson(row.whatsapp_cipher) || {};
      const identity = decryptJson(row.identity_cipher) || {};
      const address = decryptJson(row.address_cipher) || {};
      return {
        id: row.id, name: row.name, phone: phone.e164 || "", hasWhatsapp: row.has_whatsapp ? "نعم" : "لا",
        whatsappPhone: whatsapp.e164 || "", identityNumber: identity.number || "", birthYear: row.birth_year || "",
        sourceCode: row.source_code, source: row.source_label, address: JSON.stringify(address),
        prescriptions: JSON.stringify(byCustomer.get(row.id) || []), createdAt: row.created_at, updatedAt: row.updated_at,
      };
    });
    await writeAudit(client, actor, "customer.export", "customer", null, { count: rows.length, format, filtered: Boolean(search.text) }, ipAddress);
    if (String(format).toLowerCase() === "xlsx") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "العملاء");
      return { buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", count: rows.length };
    }
    const headers = Object.keys(rows[0] || { id: "", name: "" });
    const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")).join("\r\n")}`;
    return { buffer: Buffer.from(csv, "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv", count: rows.length };
  });
}

async function readCustomer(client, id) {
  const result = await client.query(
    `SELECT c.*, s.code AS source_code, s.label_ar AS source_label, a.address_cipher
     FROM crm_customers c JOIN crm_customer_sources s ON s.id=c.source_id
     LEFT JOIN crm_customer_addresses a ON a.customer_id=c.id WHERE c.id=$1`, [id],
  );
  if (!result.rows[0]) throw new AppError("العميل غير موجود.", 404);
  const prescriptions = await client.query(
    `SELECT id, exam_date, prescription_cipher, consent_at, exceptional, exception_reason, created_at
     FROM crm_prescriptions WHERE customer_id=$1 AND deleted_at IS NULL ORDER BY exam_date DESC, created_at DESC`, [id],
  );
  return exposeCustomer(result.rows[0], prescriptions.rows);
}

function exposeCustomer(row, prescriptions) {
  return {
    id: row.id, name: row.name, primaryPhone: decryptJson(row.phone_cipher), hasWhatsapp: row.has_whatsapp,
    whatsappPhone: decryptJson(row.whatsapp_cipher), identity: decryptJson(row.identity_cipher), birthYear: row.birth_year,
    source: { code: row.source_code, label: row.source_label }, address: decryptJson(row.address_cipher),
    prescriptions: prescriptions.map((item) => ({ ...item, values: decryptJson(item.prescription_cipher), prescription_cipher: undefined })),
    deletedAt: row.deleted_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function protectCustomer(input) {
  const phone = normalizePhone(input.primaryPhone);
  const whatsapp = input.hasWhatsapp ? phone : normalizePhone(input.whatsappPhone);
  const identity = String(input.identityNumber || "").trim();
  return {
    phone: protectedText(phone.e164, phone.countryCode),
    whatsapp: protectedText(whatsapp.e164, whatsapp.countryCode),
    identity: identity ? { type: identityType(identity), cipher: encryptJson({ number: identity }), hash: blindIndex(identity), last4: identity.slice(-4) } : emptyProtected(),
  };
}

function protectedText(value, countryCode) {
  return { countryCode, cipher: encryptJson({ e164: value, countryCode }), hash: blindIndex(value), last4: value.slice(-4) };
}

function emptyProtected() {
  return { type: null, cipher: null, hash: null, last4: null };
}

async function resolveSource(client, code) {
  const result = await client.query("SELECT id FROM crm_customer_sources WHERE code=$1 AND active=true", [code]);
  if (!result.rows[0]) throw new AppError("مصدر العميل غير صالح.", 422);
  return result.rows[0].id;
}

async function saveAddress(client, customerId, address, actor) {
  await client.query(
    `INSERT INTO crm_customer_addresses(customer_id,country_code,address_cipher,created_by,updated_by)
     VALUES($1,'SA',$2,$3,$3) ON CONFLICT(customer_id) DO UPDATE SET address_cipher=$2,updated_at=now(),updated_by=$3`,
    [customerId, encryptJson(address), actor],
  );
}

async function savePrescription(client, customerId, prescription, actor) {
  const exceptional = prescriptionExceptional(prescription);
  const result = await client.query(
    `INSERT INTO crm_prescriptions(customer_id,exam_date,prescription_cipher,consent_at,exceptional,exception_reason,created_by,updated_by)
     VALUES($1,COALESCE($2::date,current_date),$3,now(),$4,$5,$6,$6) RETURNING id`,
    [customerId, prescription.examDate || null, encryptJson(prescription), exceptional, prescription.exceptionReason || null, actor],
  );
  return result.rows[0].id;
}

async function requireCustomer(client, id, includeDeleted = false) {
  const result = await client.query(`SELECT id FROM crm_customers WHERE id=$1 ${includeDeleted ? "" : "AND deleted_at IS NULL"}`, [id]);
  if (!result.rows[0]) throw new AppError("العميل غير موجود.", 404);
}

function searchValues(query) {
  const text = String(query || "").trim();
  const phone = tryNormalizePhone({ countryCode: "SA", number: text });
  return { text, phoneHash: phone ? blindIndex(phone.e164) : null, identityHash: validateSaudiIdentity(text) ? blindIndex(text) : null };
}

function customerError(error) {
  if (error.code === "23505") return new AppError("يوجد عميل مسجل بنفس رقم الهاتف أو الهوية.", 409);
  return error;
}
