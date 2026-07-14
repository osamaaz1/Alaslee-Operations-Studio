// Posts protected manual sales using authoritative Daftra snapshot constraints.

import { config } from "../config.js";
import { decryptJson } from "../infra/crm/cryptoVault.js";
import { withCrmTransaction } from "../infra/crm/postgres.js";
import { AppError } from "../utils/errors.js";
import { writeAudit } from "./crmAuditService.js";
import { recalculateCustomerRfm } from "./crmRfmService.js";

export async function listSales(actor) {
  return withCrmTransaction(actor, async (client) => {
    const result = await client.query(
      `SELECT s.id,s.customer_id,c.name AS customer_name,s.invoice_number,s.status,s.occurred_at,s.total_amount,s.warning_reason,
              s.payment_tracking_enabled,s.delivery_status,s.scheduled_delivery_at,s.delivered_at,
              COUNT(i.id)::int AS items_count FROM crm_sales s JOIN crm_customers c ON c.id=s.customer_id
       LEFT JOIN crm_sale_items i ON i.sale_id=s.id GROUP BY s.id,c.name ORDER BY s.occurred_at DESC LIMIT 200`,
    );
    const totals = await paymentTotalsBySale(client, result.rows.map((row) => row.id));
    return result.rows.map((row) => exposePaymentState(row, totals.get(row.id)));
  });
}

export async function listSalesAgenda(actor) {
  return withCrmTransaction(actor, async (client) => {
    const result = await client.query(
      `SELECT s.id,s.customer_id,c.name AS customer_name,c.phone_cipher,s.invoice_number,s.status,s.occurred_at,
              s.total_amount,s.payment_tracking_enabled,s.delivery_status,s.scheduled_delivery_at,s.delivered_at,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',i.id,'product_id',i.daftra_product_id,'product_code',i.product_code,'sku',i.sku,
                'product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total
              ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
       FROM crm_sales s JOIN crm_customers c ON c.id=s.customer_id
       LEFT JOIN crm_sale_items i ON i.sale_id=s.id
       WHERE s.status='posted' AND s.delivery_status IN ('pending','ready') AND s.scheduled_delivery_at IS NOT NULL
       GROUP BY s.id,c.id ORDER BY s.scheduled_delivery_at,s.occurred_at LIMIT 5000`,
    );
    const totals = await paymentTotalsBySale(client, result.rows.map((row) => row.id));
    const today = riyadhDateKey();
    const sales = result.rows.map((row) => exposeAgendaSale(row, totals.get(row.id)));
    return {
      asOfDate: today,
      buckets: {
        overdue: agendaBucket(sales.filter((sale) => sale.scheduled_delivery_at < today)),
        today: agendaBucket(sales.filter((sale) => sale.scheduled_delivery_at === today)),
        upcoming: agendaBucket(sales.filter((sale) => sale.scheduled_delivery_at > today)),
        ready: agendaBucket(sales.filter((sale) => sale.delivery_status === "ready")),
      },
    };
  });
}

export async function getSale(saleId, actor) {
  return withCrmTransaction(actor, (client) => readSale(client, saleId));
}

export async function createSale(input, actor, ipAddress) {
  try {
    return await withCrmTransaction(actor, async (client) => {
      const sale = await createSaleInTransaction(client, input, actor);
      await writeAudit(client, actor, "sale.create", "sale", sale.id,
        { total: sale.total_amount, invoiceNumber: sale.invoice_number }, ipAddress);
      await recalculateCustomerRfm(client, input.customerId, actor.id);
      return readSale(client, sale.id);
    });
  } catch (error) {
    throw saleWriteError(error);
  }
}

export async function addSalePayment(saleId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const sale = await trackedPostedSaleForUpdate(client, saleId);
    const paid = await netPaidAmount(client, saleId);
    const amount = money(input.amount);
    const remaining = money(Number(sale.total_amount) - paid);
    if (amount > remaining) throw new AppError(`الدفعة تتجاوز المتبقي ${remaining.toFixed(2)} ر.س.`, 422);
    await insertPaymentEntry(client, saleId, "payment", amount, input.occurredAt, null, actor.id);
    await writeAudit(client, actor, "sale.payment", "sale", saleId, { amount }, ipAddress);
    return readSale(client, saleId);
  });
}

export async function refundSalePayment(saleId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    await trackedSaleForUpdate(client, saleId);
    const paid = await netPaidAmount(client, saleId);
    const amount = money(input.amount);
    if (amount > paid) throw new AppError(`مبلغ الرد يتجاوز صافي المدفوع ${paid.toFixed(2)} ر.س.`, 422);
    await insertPaymentEntry(client, saleId, "refund", amount, input.occurredAt, input.reason, actor.id);
    await writeAudit(client, actor, "sale.refund", "sale", saleId, { amount, reason: input.reason }, ipAddress);
    return readSale(client, saleId);
  });
}

export async function updateSaleDelivery(saleId, input, actor, ipAddress) {
  return withCrmTransaction(actor, async (client) => {
    const sale = await postedSaleForUpdate(client, saleId);
    assertDeliveryTransition(sale.delivery_status, input.status, actor, input.reason);
    const scheduledAt = deliveryDateKey(input.scheduledDeliveryAt || sale.scheduled_delivery_at);
    if (["pending", "ready"].includes(input.status) && !scheduledAt) {
      throw new AppError("حدد تاريخ تسليم الطلب.", 422);
    }
    if (scheduledAt && deliveryDateKey(scheduledAt) < deliveryDateKey(sale.occurred_at)) {
      throw new AppError("تاريخ التسليم يجب ألا يسبق تاريخ البيع.", 422);
    }
    const deliveredAt = input.status === "delivered"
      ? sale.delivered_at || new Date()
      : null;
    await client.query(
      `UPDATE crm_sales SET delivery_status=$1,scheduled_delivery_at=$2,delivered_at=$3,
         updated_at=now(),updated_by=$4 WHERE id=$5`,
      [input.status, scheduledAt || null, deliveredAt, actor.id, saleId],
    );
    await writeAudit(client, actor, "sale.delivery", "sale", saleId,
      { from: sale.delivery_status, to: input.status, scheduledDeliveryAt: scheduledAt || null, reason: input.reason || null }, ipAddress);
    return readSale(client, saleId);
  });
}

export async function correctSale(saleId, input, actor, ipAddress) {
  try {
    return await withCrmTransaction(actor, async (client) => {
      await saleRowForUpdate(client, saleId);
      const before = await readSale(client, saleId);
      const paid = await netPaidAmount(client, saleId);
      if (paid > 0 && ["edit", "void", "delete"].includes(input.action)) {
        throw new AppError("يجب تسجيل رد كامل للمبلغ المدفوع قبل تعديل البيع أو إلغائه.", 422);
      }
      const nextStatus = correctionStatus(input.action);
      const restoredDelivery = input.action === "restore" ? await deliveryBeforeCancellation(client, saleId) : null;
      const nextDelivery = input.action === "restore"
        ? restoredDelivery?.delivery_status || "pending"
        : "cancelled";
      // Release the active invoice number and stock reservation before inserting an edited replacement.
      // The transaction rolls this update back automatically if replacement validation fails.
      await client.query(
        `UPDATE crm_sales SET status=$1,deleted_at=$2,delivery_status=$3,scheduled_delivery_at=$4,
           delivered_at=$5,updated_at=now(),updated_by=$6 WHERE id=$7`,
        [nextStatus, nextStatus === "deleted" ? new Date() : null, nextDelivery,
          deliveryDateKey(restoredDelivery?.scheduled_delivery_at || before.scheduled_delivery_at) || null,
          nextDelivery === "delivered" ? restoredDelivery?.delivered_at || before.delivered_at : null,
          actor.id, saleId],
      );
      const replacement = input.action === "edit"
        ? await createSaleInTransaction(client, { ...input.replacement, correctionOf: saleId }, actor)
        : null;
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
  } catch (error) {
    throw saleWriteError(error);
  }
}

async function createSaleInTransaction(client, input, actor) {
  await requireCustomer(client, input.customerId);
  const products = await saleProducts(client, input.items.map((item) => item.productId), input.correctionOf);
  const lines = input.items.map((item) => buildLine(item, products.get(item.productId)));
  requireWarningReason(lines, input.warningReason);
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const initialPaidAmount = money(input.initialPaidAmount || 0);
  if (initialPaidAmount > total) throw new AppError("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي البيع.", 422);
  const deliveryMode = input.deliveryMode || "immediate";
  const deliveryStatus = deliveryMode === "scheduled" ? "pending" : "delivered";
  if (deliveryMode === "scheduled" && !input.scheduledDeliveryAt) throw new AppError("حدد تاريخ تسليم الطلب.", 422);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (input.scheduledDeliveryAt && input.scheduledDeliveryAt < deliveryDateKey(occurredAt)) {
    throw new AppError("تاريخ التسليم يجب ألا يسبق تاريخ البيع.", 422);
  }
  const result = await client.query(
    `INSERT INTO crm_sales(customer_id,invoice_number,occurred_at,total_amount,warning_reason,correction_of,
       payment_tracking_enabled,delivery_status,scheduled_delivery_at,delivered_at,created_by,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$10) RETURNING *`,
    [input.customerId, input.invoiceNumber.trim(), occurredAt, total, input.warningReason || null, input.correctionOf || null,
      deliveryStatus, input.scheduledDeliveryAt || null, deliveryStatus === "delivered" ? occurredAt : null, actor.id],
  );
  await insertLines(client, result.rows[0].id, lines, actor.id);
  if (initialPaidAmount > 0) {
    await insertPaymentEntry(client, result.rows[0].id, "payment", initialPaidAmount, input.occurredAt, null, actor.id);
  }
  return result.rows[0];
}

async function saleProducts(client, ids, excludedSaleId = null) {
  const productIds = [...new Set(ids)].sort();
  await client.query(
    "SELECT external_id FROM daftra_products WHERE external_id=ANY($1::text[]) ORDER BY external_id FOR UPDATE",
    [productIds],
  );
  const result = await client.query(
    `SELECT p.*,COALESCE(jsonb_agg(jsonb_build_object('storeId',s.external_id,'storeName',s.name,'quantity',l.quantity))
       FILTER(WHERE s.external_id IS NOT NULL),'[]'::jsonb) AS warehouses
     FROM daftra_products p LEFT JOIN daftra_stock_levels l ON l.product_id=p.external_id
     LEFT JOIN daftra_stores s ON s.external_id=l.store_id WHERE p.external_id=ANY($1::text[])
     GROUP BY p.external_id`, [productIds],
  );
  const reservations = await reservedQuantities(client, productIds, excludedSaleId);
  return new Map(result.rows.map((row) => [row.external_id, {
    ...row,
    reserved_quantity: reservations.get(row.external_id) || 0,
  }]));
}

async function reservedQuantities(client, productIds, excludedSaleId = null) {
  if (!productIds.length) return new Map();
  const result = await client.query(
    `SELECT i.daftra_product_id,COALESCE(SUM(i.quantity),0)::numeric AS reserved_quantity
     FROM crm_sale_items i JOIN crm_sales s ON s.id=i.sale_id
     WHERE i.daftra_product_id=ANY($1::text[]) AND s.status='posted'
       AND s.delivery_status IN ('pending','ready')
       AND ($2::uuid IS NULL OR s.id<>$2::uuid)
     GROUP BY i.daftra_product_id`,
    [productIds, excludedSaleId],
  );
  return new Map(result.rows.map((row) => [row.daftra_product_id, Number(row.reserved_quantity)]));
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
  const reserved = Number(product.reserved_quantity || 0);
  const available = stock == null ? null : Math.max(0, stock - reserved);
  if (product.track_stock !== false && available != null && item.quantity > available) {
    throw new AppError(`الكمية المتاحة للمنتج ${product.name} هي ${available} بعد الحجوزات الحالية.`, 422);
  }
  const ageHours = (Date.now() - new Date(product.synced_at).getTime()) / 3_600_000;
  return {
    productId: product.external_id, productCode: product.product_code, sku: product.sku, productName: product.name,
    brand: product.brand, category: product.category, quantity: item.quantity, unitPrice: price, referencePrice: reference,
    daftraMinimum, appliedMinimum, minimumSource: validMinimum ? "daftra" : "fallback_50_percent",
    stockBalance: stock, stockSnapshot: product.warehouses, syncedAt: product.synced_at,
    expiredSnapshot: ageHours > 24,
    lineTotal: Math.round(item.quantity * price * 100) / 100,
  };
}

function requireWarningReason(lines, reason) {
  const warning = lines.some((line) => line.expiredSnapshot || line.minimumSource === "fallback_50_percent");
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
  const saleResult = await client.query(
    `SELECT s.*,c.name AS customer_name,c.phone_cipher
     FROM crm_sales s JOIN crm_customers c ON c.id=s.customer_id WHERE s.id=$1`, [id],
  );
  if (!saleResult.rows[0]) throw new AppError("عملية البيع غير موجودة.", 404);
  const items = await client.query("SELECT * FROM crm_sale_items WHERE sale_id=$1 ORDER BY created_at", [id]);
  const payments = await client.query(
    `SELECT id,entry_type,amount,occurred_at,reason,created_at,created_by
     FROM crm_sale_payments WHERE sale_id=$1 ORDER BY occurred_at,created_at`, [id],
  );
  return exposePaymentState({ ...saleResult.rows[0], items: items.rows, payments: payments.rows }, paymentSummary(payments.rows));
}

async function insertPaymentEntry(client, saleId, entryType, amount, occurredAt, reason, actor) {
  await client.query(
    `INSERT INTO crm_sale_payments(sale_id,entry_type,amount,occurred_at,reason,created_by)
     VALUES($1,$2,$3,COALESCE($4::timestamptz,now()),$5,$6)`,
    [saleId, entryType, money(amount), occurredAt || null, reason || null, actor],
  );
}

async function paymentTotalsBySale(client, saleIds) {
  if (!saleIds.length) return new Map();
  const result = await client.query(
    `SELECT sale_id,
       COALESCE(SUM(amount) FILTER (WHERE entry_type='payment'),0)::numeric AS payments,
       COALESCE(SUM(amount) FILTER (WHERE entry_type='refund'),0)::numeric AS refunds
     FROM crm_sale_payments WHERE sale_id=ANY($1::uuid[]) GROUP BY sale_id`, [saleIds],
  );
  return new Map(result.rows.map((row) => [row.sale_id, {
    payments: Number(row.payments), refunds: Number(row.refunds),
    net: money(Number(row.payments) - Number(row.refunds)),
  }]));
}

async function netPaidAmount(client, saleId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='payment' THEN amount ELSE -amount END),0)::numeric AS net
     FROM crm_sale_payments WHERE sale_id=$1`, [saleId],
  );
  return money(result.rows[0].net);
}

function paymentSummary(rows) {
  const payments = rows.filter((row) => row.entry_type === "payment").reduce((sum, row) => sum + Number(row.amount), 0);
  const refunds = rows.filter((row) => row.entry_type === "refund").reduce((sum, row) => sum + Number(row.amount), 0);
  return { payments: money(payments), refunds: money(refunds), net: money(payments - refunds) };
}

function exposePaymentState(row, summary = { payments: 0, refunds: 0, net: 0 }) {
  const total = Number(row.total_amount || 0);
  const net = money(summary?.net || 0);
  const remaining = money(Math.max(0, total - net));
  let paymentStatus = "legacy_untracked";
  if (row.payment_tracking_enabled) {
    if ((summary?.refunds || 0) > 0 && net === 0) paymentStatus = "refunded";
    else if (net <= 0) paymentStatus = "unpaid";
    else if (remaining <= 0) paymentStatus = "paid";
    else paymentStatus = "partially_paid";
  }
  const exposed = {
    ...row,
    scheduled_delivery_at: deliveryDateKey(row.scheduled_delivery_at) || null,
    paid_amount: net,
    remaining_amount: row.payment_tracking_enabled ? remaining : null,
    payment_status: paymentStatus,
  };
  if (row.phone_cipher) exposed.customer_phone = decryptJson(row.phone_cipher)?.e164 || null;
  delete exposed.phone_cipher;
  return exposed;
}

function exposeAgendaSale(row, summary) {
  return exposePaymentState({ ...row, items: Array.isArray(row.items) ? row.items : [] }, summary);
}

function agendaBucket(sales) {
  return {
    count: sales.length,
    remainingAmount: money(sales.reduce((sum, sale) => sum + Number(sale.remaining_amount || 0), 0)),
    sales,
  };
}

function riyadhDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function saleWriteError(error) {
  if (error?.code === "23505" && error?.constraint === "ux_crm_sales_active_manual_invoice") {
    return new AppError("رقم الفاتورة مسجل في عملية بيع أخرى.", 409, { code: "sale_invoice_exists" });
  }
  return error;
}

async function saleRowForUpdate(client, id) {
  const result = await client.query("SELECT * FROM crm_sales WHERE id=$1 FOR UPDATE", [id]);
  if (!result.rows[0]) throw new AppError("عملية البيع غير موجودة.", 404);
  return result.rows[0];
}

async function trackedSaleForUpdate(client, id) {
  const sale = await saleRowForUpdate(client, id);
  if (!sale.payment_tracking_enabled) throw new AppError("تتبع الدفعات غير متاح لهذه العملية التاريخية.", 422);
  return sale;
}

async function postedSaleForUpdate(client, id) {
  const sale = await saleRowForUpdate(client, id);
  if (sale.status !== "posted") throw new AppError("لا يمكن تحديث عملية بيع ملغاة أو محذوفة.", 422);
  return sale;
}

async function trackedPostedSaleForUpdate(client, id) {
  const sale = await postedSaleForUpdate(client, id);
  if (!sale.payment_tracking_enabled) throw new AppError("تتبع الدفعات غير متاح لهذه العملية التاريخية.", 422);
  return sale;
}

function assertDeliveryTransition(current, next, actor, reason) {
  if (current === "cancelled") throw new AppError("لا يمكن تحديث تسليم عملية ملغاة.", 422);
  const order = { pending: 0, ready: 1, delivered: 2 };
  const backwards = order[next] < order[current];
  if (backwards && (actor.role !== "superuser" || String(reason || "").trim().length < 3)) {
    throw new AppError("التراجع عن حالة التسليم متاح للمشرف مع كتابة السبب.", 403);
  }
}

async function deliveryBeforeCancellation(client, saleId) {
  const result = await client.query(
    `SELECT before_snapshot->>'delivery_status' AS delivery_status,
            before_snapshot->>'scheduled_delivery_at' AS scheduled_delivery_at,
            before_snapshot->>'delivered_at' AS delivered_at
     FROM crm_sale_corrections WHERE sale_id=$1 AND action IN ('edit','void','delete')
     ORDER BY created_at DESC LIMIT 1`, [saleId],
  );
  return result.rows[0] || null;
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

function deliveryDateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(parsed);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function money(value) {
  const parsed = Number(value);
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
}
