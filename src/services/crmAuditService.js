// Writes immutable, redacted CRM audit events inside existing transactions.

export async function writeAudit(client, actor, action, entityType, entityId, details = {}, ipAddress = null) {
  await client.query(
    `INSERT INTO crm_audit_events(actor, role, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [actor.id, actor.role, action, entityType, entityId ? String(entityId) : null, JSON.stringify(details), ipAddress],
  );
}

export async function listAuditEvents(client, entityType, entityId, limit = 50) {
  const result = await client.query(
    `SELECT id, actor, role, action, entity_type, entity_id, details, created_at
     FROM crm_audit_events WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [entityType, String(entityId), Math.min(100, Math.max(1, limit))],
  );
  return result.rows;
}
