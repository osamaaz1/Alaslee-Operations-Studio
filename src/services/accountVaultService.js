// Stores and reveals encrypted store credentials through the superuser-only vault.

import { providerLabel } from "../../shared/crm/accountVaultConstants.js";
import { decryptJson, encryptJson } from "../infra/crm/cryptoVault.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { AppError } from "../utils/errors.js";
import { writeAudit } from "./crmAuditService.js";

export async function listVaultEntries(actor, query = "") {
  return withCrmTransaction(actor, async (client) => {
    const text = String(query || "").trim().toLowerCase();
    const result = await client.query(
      `SELECT id,provider_code,provider_label_ar,account_label,credential_kind,url,created_at,updated_at
       FROM crm_account_vault_entries
       WHERE deleted_at IS NULL AND ($1='' OR lower(account_label) LIKE $2 OR lower(provider_label_ar) LIKE $2)
       ORDER BY provider_label_ar,account_label LIMIT 200`,
      [text, `%${text}%`],
    );
    return result.rows;
  });
}

export async function getVaultEntry(id, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const row = await activeEntry(client, id);
    await writeAudit(client, actor, "account_vault.read", "account_vault", id, {}, ipAddress);
    return detailEntry(row);
  });
}

export async function revealVaultSecret(id, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const row = await activeEntry(client, id);
    await writeAudit(client, actor, "account_vault.reveal", "account_vault", id, {}, ipAddress);
    return { id: row.id, secret: protectedValue(row.secret_cipher) };
  });
}

export async function createVaultEntry(input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const values = recordValues(input);
    const result = await client.query(
      `INSERT INTO crm_account_vault_entries(
         provider_code,provider_label_ar,account_label,credential_kind,login_cipher,secret_cipher,url,notes_cipher,created_by,updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [...values, actor.id],
    );
    await writeAudit(client, actor, "account_vault.create", "account_vault", result.rows[0].id, { provider: values[0] }, ipAddress);
    return detailEntry(result.rows[0]);
  });
}

export async function updateVaultEntry(id, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const existing = await activeEntry(client, id);
    const values = recordValues(input, existing);
    const result = await client.query(
      `UPDATE crm_account_vault_entries SET provider_code=$2,provider_label_ar=$3,account_label=$4,credential_kind=$5,
       login_cipher=$6,secret_cipher=$7,url=$8,notes_cipher=$9,updated_at=now(),updated_by=$10
       WHERE id=$1 RETURNING *`,
      [id, ...values, actor.id],
    );
    await writeAudit(client, actor, "account_vault.update", "account_vault", id, { provider: values[0] }, ipAddress);
    return detailEntry(result.rows[0]);
  });
}

export async function deleteVaultEntry(id, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    await activeEntry(client, id);
    await client.query(
      "UPDATE crm_account_vault_entries SET deleted_at=now(),deleted_by=$2,updated_at=now(),updated_by=$2 WHERE id=$1",
      [id, actor.id],
    );
    await writeAudit(client, actor, "account_vault.delete", "account_vault", id, {}, ipAddress);
    return { id, deleted: true };
  });
}

async function activeEntry(client, id) {
  const result = await client.query(
    "SELECT * FROM crm_account_vault_entries WHERE id=$1 AND deleted_at IS NULL", [id],
  );
  if (!result.rows[0]) throw new AppError("الحساب غير موجود أو تمت إزالته.", 404);
  return result.rows[0];
}

function recordValues(input, existing = null) {
  const customLabel = input.providerLabelAr || null;
  const label = providerLabel(input.providerCode, customLabel) || customLabel;
  return [
    input.providerCode,
    label,
    input.accountLabel,
    input.credentialKind,
    encryptedValue(input.login),
    input.secret === undefined ? existing.secret_cipher : encryptedValue(input.secret),
    input.url || null,
    encryptedValue(input.notes),
  ];
}

function detailEntry(row) {
  return {
    id: row.id,
    providerCode: row.provider_code,
    providerLabelAr: row.provider_label_ar,
    accountLabel: row.account_label,
    credentialKind: row.credential_kind,
    login: protectedValue(row.login_cipher),
    url: row.url,
    notes: protectedValue(row.notes_cipher),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function encryptedValue(value) {
  return value ? encryptJson({ value }) : null;
}

function protectedValue(cipher) {
  return cipher ? decryptJson(cipher)?.value || "" : "";
}
