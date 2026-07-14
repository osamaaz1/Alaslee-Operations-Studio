// Records protected multi-product sales from cached Daftra snapshots.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, CalendarClock, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { crmApi } from "./crmApi.js";
import { InstantSearchCombobox } from "./InstantSearchCombobox.jsx";

const money = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 2 });
const customerLabel = (customer) => customer?.name || "";
const customerMeta = (customer) => customer?.phone_last4 ? `الهاتف ينتهي بـ ${customer.phone_last4}` : "عميل مسجل";
const productLabel = (product) => product?.name || "";
const productMeta = (product) => `${product?.sku || product?.product_code || product?.barcode || "دون كود"} · المتاح ${product?.available_quantity ?? product?.stock_balance ?? "—"}`;

export function SaleWorkspace({ inform, onSaleSaved, initialEditSaleId = "", onEditLoaded }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState("");
  const [cart, setCart] = useState([]);
  const [initialPaidAmount, setInitialPaidAmount] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState("immediate");
  const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
  const [reason, setReason] = useState("");
  const [editSaleId, setEditSaleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupVersion, setLookupVersion] = useState(0);

  const searchCustomers = useCallback((query, signal) => crmApi.customers(query, { limit: 20, signal }), []);
  const searchProducts = useCallback((query, signal) => crmApi.products(query, { availableOnly: true, limit: 20, signal }), []);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart]);
  const warnings = cart.filter((item) => item.warning);

  useEffect(() => {
    if (!initialEditSaleId) return;
    let active = true;
    crmApi.sale(initialEditSaleId).then((sale) => {
      if (!active) return;
      setEditSaleId(initialEditSaleId);
      setInvoiceNumber(sale.invoice_number || "");
      setSelectedCustomer({
        id: sale.customer_id, name: sale.customer_name,
        phone_last4: String(sale.customer_phone || "").slice(-4),
      });
      setReason(""); setInitialPaidAmount("0");
      setDeliveryMode(sale.delivery_status === "delivered" ? "immediate" : "scheduled");
      setScheduledDeliveryAt(toDateInput(sale.scheduled_delivery_at));
      setCart(sale.items.map((item) => ({
        productId: item.daftra_product_id, name: item.product_name, sku: item.sku || item.product_code,
        quantity: Number(item.quantity), unitPrice: Number(item.unit_price), warning: false,
        stock: Number(item.stock_balance || 0),
      })));
      onEditLoaded?.();
    }).catch((error) => inform(error.message, "warning"));
    return () => { active = false; };
  }, [initialEditSaleId, inform, onEditLoaded]);

  const chooseProduct = (product) => {
    setSelectedProduct(product);
    if (product) { setPrice(product.unit_price || ""); setQuantity(1); }
  };
  const addLine = () => {
    if (!selectedProduct) return;
    const bounds = priceBounds(selectedProduct);
    const numericPrice = Number(price);
    if (numericPrice < bounds.minimum || numericPrice > bounds.maximum) {
      return inform(`السعر يجب أن يكون بين ${bounds.minimum} و${bounds.maximum} ر.س.`, "warning");
    }
    const available = Number(selectedProduct.available_quantity ?? selectedProduct.stock_balance ?? 0);
    if (selectedProduct.track_stock !== false && Number(quantity) > available) {
      return inform(`الكمية المتاحة بعد الحجوزات هي ${available}.`, "warning");
    }
    const warning = bounds.fallback || snapshotAgeHours(selectedProduct.synced_at) > 24;
    setCart((current) => [...current.filter((item) => item.productId !== selectedProduct.external_id), {
      productId: selectedProduct.external_id, name: selectedProduct.name,
      sku: selectedProduct.sku || selectedProduct.product_code, quantity: Number(quantity),
      unitPrice: numericPrice, warning, bounds, stock: available,
    }]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!invoiceNumber.trim()) return inform("أدخل رقم الفاتورة.", "warning");
    if (!selectedCustomer || !cart.length) return inform("اختر العميل وأضف منتجاً واحداً على الأقل.", "warning");
    if ((warnings.length || editSaleId) && reason.trim().length < 3) return inform("اكتب سبب التعديل أو تأكيد التحذير.", "warning");
    const paidNow = Number(initialPaidAmount || 0);
    if (paidNow < 0 || paidNow > total) return inform("المبلغ المدفوع يجب أن يكون بين صفر وإجمالي العملية.", "warning");
    if (deliveryMode === "scheduled" && !scheduledDeliveryAt) return inform("حدد تاريخ تسليم الطلب.", "warning");
    const payload = salePayload(selectedCustomer.id, invoiceNumber, cart, reason, {
      initialPaidAmount: paidNow, deliveryMode,
      scheduledDeliveryAt: deliveryMode === "scheduled" ? scheduledDeliveryAt : undefined,
    });
    setBusy(true);
    try {
      const result = editSaleId
        ? await crmApi.correctSale(editSaleId, { action: "edit", reason, replacement: payload })
        : await crmApi.createSale(payload);
      const savedSale = result.replacement || result;
      inform(editSaleId ? "تم حفظ العملية المصححة مع الأثر الكامل." : "تم تسجيل البيع. سننقلك الآن إلى متابعة المبيعات.");
      resetBuilder(); onSaleSaved?.(savedSale.id);
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setBusy(false);
    }
  };
  const resetBuilder = () => {
    setCart([]); setReason(""); setEditSaleId(""); setSelectedCustomer(null); setSelectedProduct(null);
    setInvoiceNumber(""); setInitialPaidAmount("0"); setDeliveryMode("immediate"); setScheduledDeliveryAt("");
    setLookupVersion((value) => value + 1);
  };

  return <section className="crm-stack sale-entry-page"><form className="panel sale-builder" onSubmit={submit}>
    <header className="crm-panel-title"><div><p className="eyebrow">{editSaleId ? "تصحيح موثق" : "عملية يدوية"}</p><h2>{editSaleId ? "تعديل عملية البيع" : "تسجيل بيع للعميل"}</h2></div><ShoppingBag size={22} /></header>
    {editSaleId && <div className="edit-notice"><span>سيُحفظ الأصل وتُنشأ عملية بديلة مرتبطة به.</span><button type="button" onClick={resetBuilder}>إلغاء التعديل</button></div>}
    <div className="form-grid two sale-primary-fields">
      <label className="crm-field"><span>رقم الفاتورة</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} maxLength="100" autoComplete="off" required placeholder="مثال: INV-1042" /></label>
      <InstantSearchCombobox key={`customer-${lookupVersion}`} label="العميل" placeholder="اكتب اسم العميل أو رقم الهاتف" selected={selectedCustomer}
        onSelect={setSelectedCustomer} search={searchCustomers} getKey={(customer) => customer.id}
        optionLabel={customerLabel} optionMeta={customerMeta} emptyMessage="لا يوجد عميل مطابق. تأكد من الاسم أو آخر أربعة أرقام." />
    </div>
    <InstantSearchCombobox key={`product-${lookupVersion}`} label="المنتج من دفترة" placeholder="اكتب اسم المنتج أو SKU أو الباركود" selected={selectedProduct}
      onSelect={chooseProduct} search={searchProducts} getKey={(product) => product.external_id}
      optionLabel={productLabel} optionMeta={productMeta} emptyMessage="لا توجد منتجات متاحة مطابقة في آخر مزامنة لدفترة." />
    {selectedProduct && <ProductSnapshot product={selectedProduct} />}
    <div className="sale-line-entry"><label>الكمية<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label><label>سعر الوحدة<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button className="button secondary" type="button" onClick={addLine} disabled={!selectedProduct}><Plus size={16} />إضافة</button></div>
    <CartTable cart={cart} onRemove={(id) => setCart((rows) => rows.filter((row) => row.productId !== id))} />
    <FulfillmentFields total={total} initialPaidAmount={initialPaidAmount} setInitialPaidAmount={setInitialPaidAmount}
      deliveryMode={deliveryMode} setDeliveryMode={setDeliveryMode}
      scheduledDeliveryAt={scheduledDeliveryAt} setScheduledDeliveryAt={setScheduledDeliveryAt} />
    {(warnings.length > 0 || editSaleId) && <label className="warning-reason"><span><AlertTriangle size={17} />{editSaleId ? "سبب التعديل" : "سبب تأكيد التحذير"}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={editSaleId ? "اكتب سبب تصحيح العملية" : "مثال: تم التأكد من توفر القطعة في الفرع"} /></label>}
    <div className="sale-total"><span>إجمالي العملية</span><strong>{money.format(total)}</strong><span>المتبقي بعد الدفعة</span><strong>{money.format(Math.max(0, total - Number(initialPaidAmount || 0)))}</strong></div>
    <button className="button primary wide" type="submit" disabled={!cart.length || busy}>{busy ? "جارٍ حفظ العملية…" : editSaleId ? "حفظ العملية المصححة" : "تسجيل البيع"}</button>
  </form></section>;
}

function FulfillmentFields({ total, initialPaidAmount, setInitialPaidAmount, deliveryMode, setDeliveryMode, scheduledDeliveryAt, setScheduledDeliveryAt }) {
  return <section className="sale-fulfillment"><article><header><BadgeDollarSign size={18} /><div><strong>الدفعة الأولى</strong><small>يمكن إضافة دفعات أخرى لاحقاً</small></div></header><label className="crm-field"><span>المبلغ المدفوع الآن</span><input type="number" min="0" max={total || undefined} step="0.01" value={initialPaidAmount} onChange={(event) => setInitialPaidAmount(event.target.value)} /></label><div className="fulfillment-summary"><span>المتبقي</span><b>{money.format(Math.max(0, total - Number(initialPaidAmount || 0)))}</b></div></article>
    <article><header><CalendarClock size={18} /><div><strong>استلام المنتج</strong><small>حدد إن كان التسليم فورياً أو لاحقاً</small></div></header><label className="crm-field"><span>طريقة التسليم</span><select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value)}><option value="immediate">استلام فوري</option><option value="scheduled">تسليم لاحق</option></select></label>{deliveryMode === "scheduled" && <label className="crm-field"><span>تاريخ التسليم</span><input type="date" lang="ar-SA" value={scheduledDeliveryAt} onChange={(event) => setScheduledDeliveryAt(event.target.value)} aria-describedby="scheduled-delivery-format" /><small id="scheduled-delivery-format">اليوم / الشهر / السنة فقط</small></label>}</article></section>;
}

function ProductSnapshot({ product }) { const bounds = priceBounds(product); return <div className="product-snapshot"><div><span>SKU</span><strong dir="ltr">{product.sku || product.product_code || "—"}</strong></div><div><span>سعر البيع</span><strong>{money.format(product.unit_price)}</strong></div><div><span>أقل سعر</span><strong>{money.format(bounds.minimum)}</strong>{bounds.fallback && <small>حد مؤقت 50%</small>}</div><div><span>مخزون دفترة</span><strong>{product.stock_balance ?? "—"}</strong></div><div><span>محجوز محلياً</span><strong>{product.reserved_quantity ?? 0}</strong></div><div><span>المتاح للبيع</span><strong>{product.available_quantity ?? product.stock_balance ?? "—"}</strong></div>{bounds.fallback && <p><AlertTriangle size={15} />لا يوجد حد أدنى صالح في دفترة؛ طُبق حد 50% مؤقتاً.</p>}</div>; }
function CartTable({ cart, onRemove }) { return <div className="crm-table-scroll"><table className="crm-table compact"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody>{cart.length ? cart.map((item) => <tr key={item.productId}><td>{item.name}<small dir="ltr">{item.sku}</small></td><td>{item.quantity}</td><td>{money.format(item.unitPrice)}</td><td>{money.format(item.quantity * item.unitPrice)}</td><td><button type="button" className="icon-danger" onClick={() => onRemove(item.productId)} aria-label="حذف المنتج"><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan="5">لم تضف منتجات بعد.</td></tr>}</tbody></table></div>; }
function salePayload(customerId, invoiceNumber, cart, warningReason, fulfillment = {}) { return { customerId, invoiceNumber: invoiceNumber.trim(), warningReason, ...fulfillment, items: cart.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })) }; }
function priceBounds(product) { const maximum = Number(product.unit_price || 0); const minimumValue = Number(product.minimum_price); const valid = minimumValue > 0 && minimumValue <= maximum; return { minimum: valid ? minimumValue : maximum * 0.5, maximum, fallback: !valid }; }
function snapshotAgeHours(value) { return (Date.now() - new Date(value).getTime()) / 3_600_000; }
function toDateInput(value) { if (!value) return ""; const match = String(value).match(/^\d{4}-\d{2}-\d{2}/); return match?.[0] || ""; }
