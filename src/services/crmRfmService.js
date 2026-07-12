// Calculates and persists explainable customer RFM classifications.

import { RFM_DEFAULT_RULES } from "../../shared/crm/constants.js";

const segments = Object.freeze({
  vip: "عميل VIP",
  loyal: "عميل وفي",
  new: "عميل جديد",
  at_risk: "عميل مرتفع القيمة ومعرض للفقد",
  inactive: "عميل غير نشط",
  regular: "عميل منتظم",
});

export async function recalculateCustomerRfm(client, customerId, actor = "system") {
  const snapshots = await recalculateCustomersRfm(client, [customerId], actor);
  return snapshots[0] || null;
}

export async function recalculateCustomersRfm(client, customerIds, actor = "system") {
  if (!customerIds.length) return [];
  const metricsRows = await customersMetrics(client, customerIds);
  const rules = await activeRules(client);
  const payload = metricsRows.map((metrics) => snapshotPayload(metrics, rules, actor));
  const result = await client.query(
    `INSERT INTO crm_rfm_snapshots(customer_id,recency_score,frequency_score,monetary_score,
       segment_code,segment_label_ar,explanation_ar,metrics,created_by)
     SELECT x.customer_id::uuid,x.recency_score::int,x.frequency_score::int,x.monetary_score::int,
       x.segment_code,x.segment_label_ar,x.explanation_ar,x.metrics,x.actor
     FROM jsonb_to_recordset($1::jsonb) AS x(customer_id text,recency_score text,frequency_score text,
       monetary_score text,segment_code text,segment_label_ar text,explanation_ar text,metrics jsonb,actor text)
     RETURNING *`, [JSON.stringify(payload)],
  );
  return result.rows;
}

export async function getRfmRules(client) {
  const result = await client.query(
    "SELECT id, name, rules, updated_at FROM crm_rfm_rules WHERE active = true ORDER BY updated_at DESC LIMIT 1",
  );
  return result.rows[0] || { name: "القواعد الافتراضية", rules: RFM_DEFAULT_RULES };
}

export async function updateRfmRules(client, rules, actor) {
  await client.query("UPDATE crm_rfm_rules SET active = false, updated_at = now(), updated_by = $1 WHERE active = true", [actor]);
  const result = await client.query(
    `INSERT INTO crm_rfm_rules(name, active, rules, created_by, updated_by)
     VALUES ('قواعد مخصصة', true, $1::jsonb, $2, $2) RETURNING id, name, rules, updated_at`,
    [JSON.stringify(rules), actor],
  );
  return result.rows[0];
}

async function customersMetrics(client, customerIds) {
  const result = await client.query(
    `SELECT c.id AS customer_id,MAX(s.occurred_at) FILTER (WHERE s.total_amount > 0 AND s.status='posted') AS last_purchase,
            COUNT(s.id) FILTER (WHERE s.total_amount > 0 AND s.status='posted')::int AS frequency,
            COALESCE(SUM(s.total_amount) FILTER (WHERE s.status='posted'),0)::numeric AS monetary
     FROM crm_customers c LEFT JOIN crm_sales s ON s.customer_id=c.id
     WHERE c.id=ANY($1::uuid[]) GROUP BY c.id`, [customerIds],
  );
  return result.rows.map((row) => ({
    customerId: row.customer_id,
    recencyDays: row.last_purchase ? Math.max(0, Math.floor((Date.now() - new Date(row.last_purchase).getTime()) / 86_400_000)) : 9999,
    frequency: row.frequency,
    monetary: Number(row.monetary),
    lastPurchase: row.last_purchase,
  }));
}

async function activeRules(client) {
  const result = await getRfmRules(client);
  return result.rules || RFM_DEFAULT_RULES;
}

function scoreMetrics(metrics, rules) {
  return {
    recency: descendingScore(metrics.recencyDays, rules.recencyDays),
    frequency: ascendingScore(metrics.frequency, rules.frequency),
    monetary: ascendingScore(metrics.monetary, rules.monetary),
  };
}

function snapshotPayload(metrics, rules, actor) {
  const scores = scoreMetrics(metrics, rules);
  const segmentCode = segmentFor(scores);
  return {
    customer_id: metrics.customerId,
    recency_score: String(scores.recency),
    frequency_score: String(scores.frequency),
    monetary_score: String(scores.monetary),
    segment_code: segmentCode,
    segment_label_ar: segments[segmentCode],
    explanation_ar: explanationFor(metrics, scores, segmentCode),
    metrics,
    actor,
  };
}

function descendingScore(value, thresholds) {
  const index = thresholds.findIndex((threshold) => value <= threshold);
  return index < 0 ? 1 : 5 - index;
}

function ascendingScore(value, thresholds) {
  let score = 1;
  thresholds.forEach((threshold, index) => { if (value >= threshold) score = index + 2; });
  return Math.min(5, score);
}

function segmentFor(scores) {
  if (scores.recency >= 4 && scores.frequency >= 4 && scores.monetary >= 4) return "vip";
  if (scores.recency >= 3 && scores.frequency >= 4) return "loyal";
  if (scores.recency >= 4 && scores.frequency <= 2) return "new";
  if (scores.recency <= 2 && scores.monetary >= 4) return "at_risk";
  if (scores.recency <= 2) return "inactive";
  return "regular";
}

function explanationFor(metrics, scores, segmentCode) {
  const value = Number(metrics.monetary).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 2 });
  return `${segments[segmentCode]}: آخر شراء قبل ${metrics.recencyDays} يوم، ${metrics.frequency} عملية شراء، وقيمة ${value} ر.س. الدرجات ${scores.recency}/${scores.frequency}/${scores.monetary}.`;
}
