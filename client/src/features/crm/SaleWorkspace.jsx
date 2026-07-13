// Records protected multi-product sales from cached Daftra snapshots.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, CalendarClock, Pencil, Plus, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { crmApi } from "./crmApi.js";

const money = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 2 });

export function SaleWorkspace({ session, inform }) {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState("");
  const [cart, setCart] = useState([]);
  const [initialPaidAmount, setInitialPaidAmount] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState("immediate");
  const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
  const [reason, setReason] = useState("");
  const [editSaleId, setEditSaleId] = useState("");
  const load = useCallback(async () => {
    const [customerRows, productRows, saleRows] = await Promise.all([crmApi.customers(), crmApi.products("", { availableOnly: true }), crmApi.sales()]);
    setCustomers(customerRows); setProducts(productRows); setSales(saleRows);
  }, []);
  useEffect(() => { load().catch((error) => inform(error.message, "warning")); }, [load, inform]);
  const selected = products.find((product) => product.external_id === productId);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart]);
  const warnings = cart.filter((item) => item.warning);

  const chooseProduct = (id) => { setProductId(id); const product = products.find((item) => item.external_id === id); setPrice(product?.unit_price || ""); setQuantity(1); };
  const addLine = () => {
    if (!selected) return;
    const bounds = priceBounds(selected);
    const numericPrice = Number(price);
    if (numericPrice < bounds.minimum || numericPrice > bounds.maximum) return inform(`السعر يجب أن يكون بين ${bounds.minimum} و${bounds.maximum} ر.س.`, "warning");
    const available = Number(selected.available_quantity ?? selected.stock_balance ?? 0);
    if (selected.track_stock !== false && Number(quantity) > available) return inform(`الكمية المتاحة بعد الحجوزات هي ${available}.`, "warning");
    const warning = bounds.fallback || snapshotAgeHours(selected.synced_at) > 24;
    setCart((current) => [...current.filter((item) => item.productId !== selected.external_id), {
      productId: selected.external_id, name: selected.name, sku: selected.sku || selected.product_code,
      quantity: Number(quantity), unitPrice: numericPrice, warning, bounds, stock: available,
    }]);
  };
  const submit = async () => {
    if (!customerId || !cart.length) return inform("اختر العميل وأضف منتجاً واحداً على الأقل.", "warning");
    if ((warnings.length || editSaleId) && reason.trim().length < 3) return inform("اكتب سبب التعديل أو تأكيد التحذير.", "warning");
    const paidNow = Number(initialPaidAmount || 0);
    if (paidNow < 0 || paidNow > total) return inform("المبلغ المدفوع يجب أن يكون بين صفر وإجمالي العملية.", "warning");
    if (deliveryMode === "scheduled" && !scheduledDeliveryAt) return inform("حدد موعد تسليم الطلب.", "warning");
    const payload = salePayload(customerId, cart, reason, {
      initialPaidAmount: paidNow,
      deliveryMode,
      scheduledDeliveryAt: deliveryMode === "scheduled" ? new Date(scheduledDeliveryAt).toISOString() : undefined,
    });
    if (editSaleId) await crmApi.correctSale(editSaleId, { action: "edit", reason, replacement: payload });
    else await crmApi.createSale(payload);
    inform(editSaleId ? "تم حفظ العملية المصححة مع الأثر الكامل." : "تم تسجيل عملية البيع وتحديث تصنيف العميل.");
    resetBuilder(); await load();
  };
  const resetBuilder = () => { setCart([]); setReason(""); setEditSaleId(""); setCustomerId(""); setProductId(""); setInitialPaidAmount("0"); setDeliveryMode("immediate"); setScheduledDeliveryAt(""); };
  const editSale = async (id) => {
    const sale = await crmApi.sale(id);
    setEditSaleId(id); setCustomerId(sale.customer_id); setReason("");
    setInitialPaidAmount("0");
    setDeliveryMode(sale.delivery_status === "delivered" ? "immediate" : "scheduled");
    setScheduledDeliveryAt(toDateTimeLocal(sale.scheduled_delivery_at));
    setCart(sale.items.map((item) => ({
      productId: item.product_id, name: item.product_name, sku: item.sku || item.product_code,
      quantity: Number(item.quantity), unitPrice: Number(item.unit_price), warning: false,
      stock: Number(item.stock_balance || 0),
    })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <section className="crm-stack"><div className="sale-layout"><article className="panel sale-builder"><header className="crm-panel-title"><div><p className="eyebrow">{editSaleId ? "تصحيح موثق" : "عملية يدوية"}</p><h2>{editSaleId ? "تعديل عملية البيع" : "تسجيل بيع للعميل"}</h2></div><ShoppingBag size={22} /></header>
    {editSaleId && <div className="edit-notice"><span>سيُحفظ الأصل وتُنشأ عملية بديلة مرتبطة به.</span><button type="button" onClick={resetBuilder}>إلغاء التعديل</button></div>}
    <div className="form-grid two"><label className="crm-field"><span>العميل</span><select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">اختر العميل</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.phone_last4}</option>)}</select></label>
      <label className="crm-field"><span>المنتج من دفترة</span><select value={productId} onChange={(e) => chooseProduct(e.target.value)}><option value="">اختر SKU أو المنتج</option>{products.map((product) => <option value={product.external_id} key={product.external_id}>{product.sku || product.product_code} · {product.name}</option>)}</select></label></div>
    {selected && <ProductSnapshot product={selected} />}
    <div className="sale-line-entry"><label>الكمية<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} /></label><label>سعر الوحدة<input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label><button className="button secondary" type="button" onClick={addLine} disabled={!selected}><Plus size={16} />إضافة</button></div>
    <CartTable cart={cart} onRemove={(id) => setCart((rows) => rows.filter((row) => row.productId !== id))} />
    <FulfillmentFields total={total} initialPaidAmount={initialPaidAmount} setInitialPaidAmount={setInitialPaidAmount}
      deliveryMode={deliveryMode} setDeliveryMode={setDeliveryMode}
      scheduledDeliveryAt={scheduledDeliveryAt} setScheduledDeliveryAt={setScheduledDeliveryAt} />
    {(warnings.length > 0 || editSaleId) && <label className="warning-reason"><span><AlertTriangle size={17} />{editSaleId ? "سبب التعديل" : "سبب تأكيد التحذير"}</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={editSaleId ? "اكتب سبب تصحيح العملية" : "مثال: تم التأكد من توفر القطعة في الفرع"} /></label>}
    <div className="sale-total"><span>إجمالي العملية</span><strong>{money.format(total)}</strong><span>المتبقي بعد الدفعة</span><strong>{money.format(Math.max(0, total - Number(initialPaidAmount || 0)))}</strong></div><button className="button primary wide" type="button" onClick={submit} disabled={!cart.length}>{editSaleId ? "حفظ العملية المصححة" : "تسجيل البيع"}</button>
  </article><SalesHistory sales={sales} session={session} inform={inform} reload={load} onEdit={editSale} /></div></section>;
}

function FulfillmentFields({ total, initialPaidAmount, setInitialPaidAmount, deliveryMode, setDeliveryMode, scheduledDeliveryAt, setScheduledDeliveryAt }) {
  return <section className="sale-fulfillment"><article><header><BadgeDollarSign size={18} /><div><strong>الدفعة الأولى</strong><small>يمكن إضافة دفعات أخرى لاحقاً</small></div></header><label className="crm-field"><span>المبلغ المدفوع الآن</span><input type="number" min="0" max={total || undefined} step="0.01" value={initialPaidAmount} onChange={(event) => setInitialPaidAmount(event.target.value)} /></label><div className="fulfillment-summary"><span>المتبقي</span><b>{money.format(Math.max(0, total - Number(initialPaidAmount || 0)))}</b></div></article>
    <article><header><CalendarClock size={18} /><div><strong>استلام المنتج</strong><small>حدد إن كان التسليم فورياً أو لاحقاً</small></div></header><label className="crm-field"><span>طريقة التسليم</span><select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value)}><option value="immediate">استلام فوري</option><option value="scheduled">تسليم لاحق</option></select></label>{deliveryMode === "scheduled" && <label className="crm-field"><span>موعد التسليم</span><input type="datetime-local" value={scheduledDeliveryAt} onChange={(event) => setScheduledDeliveryAt(event.target.value)} /></label>}</article></section>;
}

function ProductSnapshot({ product }) { const bounds = priceBounds(product); return <div className="product-snapshot"><div><span>SKU</span><strong dir="ltr">{product.sku || product.product_code || "—"}</strong></div><div><span>سعر البيع</span><strong>{money.format(product.unit_price)}</strong></div><div><span>أقل سعر</span><strong>{money.format(bounds.minimum)}</strong>{bounds.fallback && <small>حد مؤقت 50%</small>}</div><div><span>مخزون دفترة</span><strong>{product.stock_balance ?? "—"}</strong></div><div><span>محجوز محلياً</span><strong>{product.reserved_quantity ?? 0}</strong></div><div><span>المتاح للبيع</span><strong>{product.available_quantity ?? product.stock_balance ?? "—"}</strong></div>{bounds.fallback && <p><AlertTriangle size={15} />لا يوجد حد أدنى صالح في دفترة؛ طُبق حد 50% مؤقتاً.</p>}</div>; }
function CartTable({ cart, onRemove }) { return <div className="crm-table-scroll"><table className="crm-table compact"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody>{cart.length ? cart.map((item) => <tr key={item.productId}><td>{item.name}<small dir="ltr">{item.sku}</small></td><td>{item.quantity}</td><td>{money.format(item.unitPrice)}</td><td>{money.format(item.quantity * item.unitPrice)}</td><td><button type="button" className="icon-danger" onClick={() => onRemove(item.productId)} aria-label="حذف المنتج"><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan="5">لم تضف منتجات بعد.</td></tr>}</tbody></table></div>; }
function SalesHistory({ sales, session, inform, reload, onEdit }) {
  return <article className="panel sales-history"><header className="crm-panel-title"><div><p className="eyebrow">السجل</p><h2>آخر العمليات</h2></div><span>{sales.length}</span></header><div className="sales-list">{sales.map((sale) => <div className="sale-record" key={sale.id}><div className="sale-record-main"><span className={`sale-status ${sale.status}`}>{statusLabel(sale.status)}</span><div><strong>{sale.customer_name}</strong><small>{new Date(sale.occurred_at).toLocaleString("ar-SA-u-nu-latn")} · {sale.items_count} منتجات</small></div><b>{money.format(sale.total_amount)}</b></div><div className="sale-state-row"><span className={`payment-state ${sale.payment_status}`}>{paymentStatusLabel(sale)}</span><span className={`delivery-state ${sale.delivery_status}`}>{deliveryStatusLabel(sale.delivery_status)}</span>{sale.scheduled_delivery_at && <small><CalendarClock size={13} />{new Date(sale.scheduled_delivery_at).toLocaleString("ar-SA-u-nu-latn")}</small>}</div><SaleOperations sale={sale} session={session} inform={inform} reload={reload} />{session.role === "superuser" && <SaleActions sale={sale} inform={inform} reload={reload} onEdit={onEdit} />}</div>)}</div></article>;
}

function SaleOperations({ sale, session, inform, reload }) {
  if (sale.status !== "posted") return null;
  const addPayment = async () => {
    const raw = window.prompt(`المبلغ المتبقي ${money.format(sale.remaining_amount)} — أدخل مبلغ الدفعة`);
    if (raw == null) return;
    const amount = Number(raw);
    if (!(amount > 0)) return inform("أدخل مبلغ دفعة صالحاً.", "warning");
    await crmApi.addSalePayment(sale.id, { amount }); inform("تم تسجيل الدفعة."); await reload();
  };
  const refund = async () => {
    const raw = window.prompt(`صافي المدفوع ${money.format(sale.paid_amount)} — أدخل مبلغ الرد`);
    if (raw == null) return;
    const amount = Number(raw); if (!(amount > 0)) return inform("أدخل مبلغ رد صالحاً.", "warning");
    const reason = window.prompt("سبب رد المبلغ"); if (!reason) return;
    await crmApi.refundSalePayment(sale.id, { amount, reason }); inform("تم تسجيل رد المبلغ."); await reload();
  };
  const updateDelivery = async (status) => {
    await crmApi.updateSaleDelivery(sale.id, { status, scheduledDeliveryAt: sale.scheduled_delivery_at || undefined });
    inform(status === "ready" ? "تم تحديث الطلب إلى جاهز للتسليم." : "تم تسجيل تسليم الطلب."); await reload();
  };
  const reschedule = async () => {
    const value = window.prompt("موعد التسليم", toDateTimeLocal(sale.scheduled_delivery_at));
    if (!value) return;
    const date = new Date(value); if (Number.isNaN(date.getTime())) return inform("موعد التسليم غير صالح.", "warning");
    await crmApi.updateSaleDelivery(sale.id, { status: sale.delivery_status, scheduledDeliveryAt: date.toISOString() });
    inform("تم تحديث موعد التسليم."); await reload();
  };
  return <div className="sale-operation-actions">{sale.payment_tracking_enabled && Number(sale.remaining_amount) > 0 && <button type="button" onClick={() => runAction(addPayment, inform)}>إضافة دفعة</button>}{session.role === "superuser" && sale.payment_tracking_enabled && Number(sale.paid_amount) > 0 && <button type="button" onClick={() => runAction(refund, inform)}>رد مبلغ</button>}{["pending", "ready"].includes(sale.delivery_status) && <button type="button" onClick={() => runAction(reschedule, inform)}>تعديل الموعد</button>}{sale.delivery_status === "pending" && <button type="button" onClick={() => runAction(() => updateDelivery("ready"), inform)}>جاهز</button>}{sale.delivery_status === "ready" && <button type="button" onClick={() => runAction(() => updateDelivery("delivered"), inform)}>تم التسليم</button>}</div>;
}
function SaleActions({ sale, inform, reload, onEdit }) {
  const correct = async (action, prompt, message) => {
    const reason = window.prompt(prompt); if (!reason) return;
    await crmApi.correctSale(sale.id, { action, reason }); inform(message); await reload();
  };
  if (sale.status !== "posted") return <button type="button" title="استعادة" onClick={() => correct("restore", "سبب استعادة العملية", "تمت استعادة العملية.")}><RotateCcw size={14} /></button>;
  const hasPaid = Number(sale.paid_amount || 0) > 0;
  return <span className="sale-actions"><button type="button" title={hasPaid ? "رد المبلغ أولاً" : "تعديل"} disabled={hasPaid} onClick={() => onEdit(sale.id)}><Pencil size={14} /></button><button type="button" title={hasPaid ? "رد المبلغ أولاً" : "إلغاء"} disabled={hasPaid} onClick={() => correct("void", "سبب إلغاء العملية", "تم إلغاء العملية مع حفظ الأثر.")}><RotateCcw size={14} /></button><button type="button" title={hasPaid ? "رد المبلغ أولاً" : "حذف"} disabled={hasPaid} onClick={() => correct("delete", "سبب حذف العملية", "تم حذف العملية مع حفظ الأثر.")}><Trash2 size={14} /></button></span>;
}
function salePayload(customerId, cart, warningReason, fulfillment = {}) { return { customerId, warningReason, ...fulfillment, items: cart.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })) }; }
function priceBounds(product) { const maximum = Number(product.unit_price || 0); const minimumValue = Number(product.minimum_price); const valid = minimumValue > 0 && minimumValue <= maximum; return { minimum: valid ? minimumValue : maximum * 0.5, maximum, fallback: !valid }; }
function snapshotAgeHours(value) { return (Date.now() - new Date(value).getTime()) / 3_600_000; }
function statusLabel(status) { return status === "posted" ? "مسجلة" : status === "voided" ? "ملغاة" : "محذوفة"; }
function paymentStatusLabel(sale) { if (sale.payment_status === "legacy_untracked") return "دفع غير متتبع · قديم"; if (sale.payment_status === "paid") return "مدفوع بالكامل"; if (sale.payment_status === "partially_paid") return `مدفوع ${money.format(sale.paid_amount)} · متبقي ${money.format(sale.remaining_amount)}`; if (sale.payment_status === "refunded") return "تم رد المبلغ"; return `غير مدفوع · ${money.format(sale.remaining_amount)}`; }
function deliveryStatusLabel(status) { return status === "pending" ? "قيد التجهيز" : status === "ready" ? "جاهز للتسليم" : status === "delivered" ? "تم التسليم" : "ملغي"; }
function toDateTimeLocal(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
async function runAction(action, inform) { try { await action(); } catch (error) { inform(error.message, "warning"); } }
