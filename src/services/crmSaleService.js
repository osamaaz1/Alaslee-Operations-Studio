// Posts protected manual sales using authoritative Daftra snapshot constraints.

import { config } from "../config.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { AppError } from "../utils/errors.js";
import { writeAudit } from "./crmAuditService.js";
import { recalculateCustomerRfm } from "./crmRfmService.js";

export async function listSales(actor) {
  return withCrmTransaction(actor, async (client) => {
    const result = await client.query(
      `SELECT s.id,s.customer_id,c.name AS customer_name,s.status,s.occurred_at,s.total_amount,s.warning_reason,
              COUNT(i.id)::int AS items_count FROM crm_sales s JOIN crm_customers c ON c.id=s.customer_id
       LEFT JOIN crm_sale_items i ON i.sale_id=s.id GROUP BY s.id,c.name ORDER BY s.occurred_at DESC LIMIT 200`,
    );
    return result.rows;
  });
}

export async function getSale(saleId, actor) {
  return withCrmTransaction(actor, (client) => readSale(client, saleId));
}

export async function createSale(input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const sale = await createSaleInTransaction(client, input, actor);
    await writeAudit(client, actor, "sale.create", "sale", sale.id, { total: sale.total_amount }, ipAddress);
    await recalculateCustomerRfm(client, input.customerId, actor.id);
    return readSale(client, sale.id);
  });
}

export async function correctSale(saleId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const before = await readSale(client, saleId);
    const replacement = input.action === "edit"
      ? await createSaleInTransaction(client, { ...input.replacement, correctionOf: saleId }, actor)
      : null;
    const nextStatus = correctionStatus(input.action);
    await client.query(
      "UPDATE crm_sales SET status=$1,deleted_at=$2,updated_at=now(),updated_by=$3 WHERE id=$4",
      [nextStatus, nextStatus === "deleted" ? new Date() : null, actor.id, saleId],
    );
    const after = replacement ? await readSale(client, replacement.id) : { status: nextStatus };
    await client.query(
      `INSERT INTO crm_sale_corrections(sale_id,replacement_sale_id,action,reason,before_snapshot,after_snapshot,created_by)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
      [saleId, replacement?.id || null, input.action, input.reason, JSON.stringify(before), JSON.stringify(after), actor.id],
    );
    await writeAudit(client, actor, `sale.${input.action}`, "sale", saleId, { reason: input.reason, replacementId: replacement?.id }, ipAddress);
    await recalculateCustomerRfm(client, before.customer_id, actor.id);
    if (replacement && replacement.customer_id !== before.customer_id) await recalculateCustomerRfm(client, replacement.customer_id, actor.id);
    return { original: await readSale(client, saleId), replacement: replacement ? await readSale(client, replacement.id) : null };
  });
}

async function createSaleInTransaction(client, input, actor) {
  await requireCustomer(client, input.customerId);
  const products = await saleProducts(client, input.items.map((item) => item.productId));
  const lines = input.items.map((item) => buildLine(item, products.get(item.productId)));
  requireWarningReason(lines, input.warningReason);
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const result = await client.query(
    `INSERT INTO crm_sales(customer_id,occurred_at,total_amount,warning_reason,correction_of,created_by,updated_by)
     VALUES($1,COALESCE($2::timestamptz,now()),$3,$4,$5,$6,$6) RETURNING *`,
    [input.customerId, input.occurredAt || null, total, input.warningReason || null, input.correctionOf || null, actor.id],
  );
  await insertLines(client, result.rows[0].id, lines, actor.id);
  return result.rows[0];
}

async function saleProducts(client, ids) {
  const result = await client.query(
    `SELECT p.*,COALESCE(jsonb_agg(jsonb_build_object('storeId',s.external_id,'storeName',s.name,'quantity',l.quantity))
       FILTER(WHERE s.external_id IS NOT NULL),'[]'::jsonb) AS warehouses
     FROM daftra_products p LEFT JOIN daftra_stock_levels l ON l.product_id=p.external_id
     LEFT JOIN daftra_stores s ON s.external_id=l.store_id WHERE p.external_id=ANY($1::text[])
     GROUP BY p.external_id`, [ids],
  );
  return new Map(result.rows.map((row) => [row.external_id, row]));
}

function buildLine(item, product) {
  if (!product) throw new AppError("أحد المنتجات غير موجود في آخر مزامنة دفترة.", 422);
  const reference = Number(product.unit_price);
  if (!(reference > 0)) throw new AppError(`سعر البيع غير صالح للمنتج ${product.name}.`, 422);
  const daftraMinimum = product.minimum_price == null ? null : Number(product.minimum_price);
  const validMinimum = daftraMinimum > 0 && daftraMinimum <= reference;
  const appliedMinimum = validMinimum ? daftraMinimum : reference * (config.crm.priceFloorPercent / 100);
  const price = Number(item.unitPrice);
  if (price < appliedMinimum || price > reference) {
    throw new AppError(`سعر ${product.name} يجب أن يكون بين ${appliedMinimum.toFixed(2)} و${reference.toFixed(2)} ر.س.`, 422);
  }
  const stock = product.stock_balance == null ? null : Number(product.stock_balance);
  const ageHours = (Date.now() - new Date(product.synced_at).getTime()) / 3_600_000;
  return {
    productId: product.external_id, productCode: product.product_code, sku: product.sku, productName: product.name,
    brand: product.brand, category: product.category, quantity: item.quantity, unitPrice: price, referencePrice: reference,
    daftraMinimum, appliedMinimum, minimumSource: validMinimum ? "daftra" : "fallback_50_percent",
    stockBalance: stock, stockSnapshot: product.warehouses, syncedAt: product.synced_at,
    overStock: stock != null && item.quantity > stock, expiredSnapshot: ageHours > 24,
    lineTotal: Math.round(item.quantity * price * 100) / 100,
  };
}

function requireWarningReason(lines, reason) {
  const warning = lines.some((line) => line.overStock || line.expiredSnapshot || line.minimumSource === "fallback_50_percent");
  if (warning && String(reason || "").trim().length < 3) {
    throw new AppError("سبب التأكيد مطلوب بسبب تحذير السعر أو المخزون أو قدم المزامنة.", 422);
  }
}

async function insertLines(client, saleId, lines, actor) {
  const rows = lines.map((line) => ({ ...line, saleId, actor }));
  await client.query(
    `INSERT INTO crm_sale_items(
       sale_id,daftra_product_id,product_code,sku,product_name,brand,category,quantity,unit_price,
       reference_price,daftra_minimum_price,applied_minimum_price,minimum_source,stock_balance,
       stock_snapshot,product_synced_at,line_total,created_by,updated_by)
     SELECT x.sale_id::uuid,x.product_id,x.product_code,x.sku,x.product_name,x.brand,x.category,x.quantity::int,
       x.unit_price::numeric,x.reference_price::numeric,NULLIF(x.daftra_minimum,'')::numeric,x.applied_minimum::numeric,
       x.minimum_source,NULLIF(x.stock_balance,'')::numeric,x.stock_snapshot::jsonb,x.synced_at::timestamptz,
       x.line_total::numeric,x.actor,x.actor
     FROM jsonb_to_recordset($1::jsonb) AS x(
       sale_id text,product_id text,product_code text,sku text,product_name text,brand text,category text,
       quantity text,unit_price text,reference_price text,daftra_minimum text,applied_minimum text,
       minimum_source text,stock_balance text,stock_snapshot jsonb,synced_at text,line_total text,actor text)`,
    [JSON.stringify(rows.map(serializableLine))],
  );
}

function serializableLine(line) {
  return {
    sale_id: line.saleId,
    product_id: line.productId,
    product_code: line.productCode || "",
    sku: line.sku || "",
    product_name: line.productName,
    brand: line.brand || "",
    category: line.category || "",
    quantity: String(line.quantity),
    unit_price: String(line.unitPrice),
    reference_price: String(line.referencePrice),
    daftra_minimum: line.daftraMinimum == null ? "" : String(line.daftraMinimum),
    applied_minimum: String(line.appliedMinimum),
    minimum_source: line.minimumSource,
    stock_balance: line.stockBalance == null ? "" : String(line.stockBalance),
    stock_snapshot: line.stockSnapshot,
    synced_at: new Date(line.syncedAt).toISOString(),
    line_total: String(line.lineTotal),
    actor: line.actor,
  };
}

async function readSale(client, id) {
  const saleResult = await client.query("SELECT * FROM crm_sales WHERE id=$1", [id]);
  if (!saleResult.rows[0]) throw new AppError("عملية البيع غير موجودة.", 404);
  const items = await client.query("SELECT * FROM crm_sale_items WHERE sale_id=$1 ORDER BY created_at", [id]);
  return { ...saleResult.rows[0], items: items.rows };
}

async function requireCustomer(client, id) {
  const result = await client.query("SELECT id FROM crm_customers WHERE id=$1 AND deleted_at IS NULL", [id]);
  if (!result.rows[0]) throw new AppError("العميل غير موجود.", 422);
}

function correctionStatus(action) {
  if (action === "delete") return "deleted";
  if (action === "restore") return "posted";
  return "voided";
}
