// Operational sales agenda: what needs attention now and the next action for staff.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CalendarClock, ChevronLeft, CircleDollarSign, Clock3,
  LoaderCircle, Pencil, Phone, RefreshCw, RotateCcw, ShoppingBag, Trash2, X,
} from "lucide-react";
import { crmApi } from "./crmApi.js";

const money = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 2 });
const emptyAgenda = { asOfDate: "", buckets: { overdue: bucket(), today: bucket(), upcoming: bucket(), ready: bucket() } };

export function SalesDashboard({ session, inform, onNewSale, onEditSale, highlightSaleId = "" }) {
  const [agenda, setAgenda] = useState(emptyAgenda);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [nextAgenda, nextSales] = await Promise.all([crmApi.salesAgenda(), crmApi.sales()]);
      setAgenda(nextAgenda); setSales(nextSales);
    } catch (error) {
      if (!quiet) inform(error.message, "warning");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [inform]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openRecentSale = async (sale) => {
    try {
      const detail = await crmApi.sale(sale.id);
      setDialog({ title: `الفاتورة ${detail.invoice_number || "التاريخية"}`, sales: [detail] });
    } catch (error) { inform(error.message, "warning"); }
  };
  const cards = [
    { id: "overdue", label: "متأخرون عن الاستلام", hint: "تجاوزوا الموعد ولم يُسلّم الطلب", icon: AlertTriangle, tone: "danger" },
    { id: "today", label: "تسليمات اليوم", hint: "العملاء المتوقع حضورهم اليوم", icon: CalendarClock, tone: "today" },
    { id: "upcoming", label: "الطلبات القادمة", hint: "مرتبة بدءاً من أقرب موعد", icon: Clock3, tone: "upcoming" },
    { id: "ready", label: "جاهز للاستلام", hint: "تم التجهيز وينتظر تسليمه للعميل", icon: BadgeCheck, tone: "ready" },
  ];
  const priority = agenda.buckets.overdue.count
    ? { text: `لديك ${agenda.buckets.overdue.count} طلب متأخر. ابدأ بالتواصل مع أصحابها.`, action: "ابدأ بالمتأخرين", bucket: "overdue" }
    : agenda.buckets.today.count
      ? { text: `لديك ${agenda.buckets.today.count} تسليم اليوم. راجع الجاهز والمبالغ المتبقية.`, action: "راجع تسليمات اليوم", bucket: "today" }
      : { text: "لا توجد تسليمات عاجلة الآن. يمكنك تسجيل بيع جديد.", action: "تسجيل بيع جديد", bucket: null };

  return <section className="crm-stack sales-dashboard">
    {highlightSaleId && <div className="sale-created-banner" role="status"><BadgeCheck size={20} /><div><strong>تم تسجيل البيع بنجاح</strong><span>ظهرت العملية الجديدة في السجل أدناه، وستظهر في المتابعة إذا كان تسليمها لاحقاً.</span></div></div>}
    <div className="sales-guidance"><div><p className="eyebrow">الخطوة التالية</p><h2>{priority.text}</h2></div><button className="button primary" type="button" onClick={() => priority.bucket ? setDialog({ title: cards.find((card) => card.id === priority.bucket).label, sales: agenda.buckets[priority.bucket].sales }) : onNewSale()}>{priority.action}<ChevronLeft size={17} /></button></div>
    <div className="agenda-heading"><div><p className="eyebrow">مركز التسليم</p><h2>ما الذي يحتاج تدخلك؟</h2></div><button type="button" className="button quiet" onClick={() => load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />تحديث</button></div>
    {loading ? <div className="agenda-loading"><LoaderCircle className="spin" />جارٍ ترتيب تسليماتك…</div> : <div className="sales-agenda-grid">{cards.map(({ id, label, hint, icon: Icon, tone }) => {
      const item = agenda.buckets[id];
      return <button type="button" className={`agenda-card ${tone}`} key={id} onClick={() => setDialog({ title: label, sales: item.sales })}>
        <span className="agenda-icon"><Icon size={21} /></span><span className="agenda-count">{item.count}</span><strong>{label}</strong><small>{hint}</small><footer><span>المتبقي</span><b>{money.format(item.remainingAmount)}</b><ChevronLeft size={16} /></footer>
      </button>;
    })}</div>}
    <article className="panel recent-sales"><header className="crm-panel-title"><div><p className="eyebrow">السجل</p><h2>آخر عمليات البيع</h2></div><span>{sales.length}</span></header>
      <div className="recent-sales-list">{sales.length ? sales.slice(0, 30).map((sale) => <button type="button" className={sale.id === highlightSaleId ? "highlight" : ""} key={sale.id} onClick={() => openRecentSale(sale)}>
        <span className={`sale-status ${sale.status}`}>{statusLabel(sale.status)}</span><span><strong>{sale.customer_name}</strong><small>فاتورة {sale.invoice_number || "تاريخية"} · {sale.items_count} منتج</small></span><span className={`delivery-state ${sale.delivery_status}`}>{deliveryStatusLabel(sale.delivery_status)}</span><b>{money.format(sale.total_amount)}</b><ChevronLeft size={17} />
      </button>) : <div className="crm-empty"><ShoppingBag size={30} /><strong>لا توجد مبيعات بعد</strong><span>اختر «بيع جديد» لتسجيل أول عملية.</span></div>}</div>
    </article>
    {dialog && <SalesDialog {...dialog} session={session} inform={inform} onClose={() => setDialog(null)} onReload={async () => { setDialog(null); await load(); }} onEdit={(id) => { setDialog(null); onEditSale(id); }} />}
  </section>;
}

function SalesDialog({ title, sales, session, inform, onClose, onReload, onEdit }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll("button:not(:disabled),a[href],input,select,textarea,[tabindex]:not([tabindex='-1'])") || [])];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); document.body.style.overflow = originalOverflow; previous?.focus?.(); };
  }, [onClose]);
  return <div className="sales-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="sales-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-dialog-title">
      <header><div><p className="eyebrow">تفاصيل التسليم</p><h2 id="sales-dialog-title">{title}</h2><span>{sales.length} طلب</span></div><button ref={closeRef} type="button" aria-label="إغلاق" onClick={onClose}><X size={20} /></button></header>
      <div className="sales-dialog-body">{sales.length ? sales.map((sale) => <SaleDetailCard key={sale.id} sale={sale} session={session} inform={inform} onReload={onReload} onEdit={onEdit} />) : <div className="dialog-empty"><BadgeCheck size={34} /><strong>لا توجد طلبات في هذه القائمة</strong><span>كل شيء مرتب هنا.</span></div>}</div>
    </section>
  </div>;
}

function SaleDetailCard({ sale, session, inform, onReload, onEdit }) {
  const perform = async (action, success) => {
    try { await action(); inform(success); await onReload(); } catch (error) { inform(error.message, "warning"); }
  };
  const addPayment = () => {
    const raw = window.prompt(`المبلغ المتبقي ${money.format(sale.remaining_amount)} — أدخل مبلغ الدفعة`);
    if (raw == null) return;
    const amount = Number(raw); if (!(amount > 0)) return inform("أدخل مبلغ دفعة صالحاً.", "warning");
    perform(() => crmApi.addSalePayment(sale.id, { amount }), "تم تسجيل الدفعة.");
  };
  const refund = () => {
    const raw = window.prompt(`صافي المدفوع ${money.format(sale.paid_amount)} — أدخل مبلغ الرد`);
    if (raw == null) return;
    const amount = Number(raw); if (!(amount > 0)) return inform("أدخل مبلغ رد صالحاً.", "warning");
    const reason = window.prompt("سبب رد المبلغ"); if (!reason) return;
    perform(() => crmApi.refundSalePayment(sale.id, { amount, reason }), "تم تسجيل رد المبلغ.");
  };
  const updateDelivery = (status) => perform(
    () => crmApi.updateSaleDelivery(sale.id, { status, scheduledDeliveryAt: toDateInput(sale.scheduled_delivery_at) || undefined }),
    status === "ready" ? "تم تحديث الطلب إلى جاهز للاستلام." : "تم تسجيل تسليم الطلب.",
  );
  const reschedule = () => {
    const value = window.prompt("تاريخ التسليم (سنة-شهر-يوم)", toDateInput(sale.scheduled_delivery_at));
    if (!value) return;
    if (!isDateInput(value)) return inform("تاريخ التسليم غير صالح. استخدم سنة-شهر-يوم فقط.", "warning");
    perform(() => crmApi.updateSaleDelivery(sale.id, { status: sale.delivery_status, scheduledDeliveryAt: value }), "تم تحديث تاريخ التسليم.");
  };
  const correct = (action, prompt, success) => {
    const reason = window.prompt(prompt); if (!reason) return;
    perform(() => crmApi.correctSale(sale.id, { action, reason }), success);
  };
  const posted = sale.status === "posted";
  const hasPaid = Number(sale.paid_amount || 0) > 0;
  return <article className="sale-detail-card">
    <header><div><span className={`sale-status ${sale.status}`}>{statusLabel(sale.status)}</span><span className={`delivery-state ${sale.delivery_status}`}>{deliveryStatusLabel(sale.delivery_status)}</span></div><strong>{sale.customer_name}</strong><small>فاتورة <b dir="ltr">{sale.invoice_number || "تاريخية"}</b></small></header>
    <div className="sale-contact"><a href={sale.customer_phone ? `tel:${sale.customer_phone}` : undefined} aria-disabled={!sale.customer_phone}><Phone size={16} /><span>{sale.customer_phone || "رقم الهاتف غير متاح"}</span></a><span><CalendarClock size={16} />{sale.scheduled_delivery_at ? formatDeliveryDate(sale.scheduled_delivery_at) : "استلام فوري"}</span></div>
    <div className="sale-products">{(sale.items || []).map((item) => <div key={item.id || item.daftra_product_id || item.product_id}><span><strong>{item.product_name}</strong><small dir="ltr">{item.sku || item.product_code || "—"}</small></span><b>{Number(item.quantity)} × {money.format(item.unit_price)}</b></div>)}</div>
    <div className="sale-payment-grid"><div><span>الإجمالي</span><strong>{money.format(sale.total_amount)}</strong></div><div><span>المدفوع</span><strong>{money.format(sale.paid_amount || 0)}</strong></div><div className={Number(sale.remaining_amount || 0) > 0 ? "due" : "paid"}><span>المتبقي</span><strong>{sale.remaining_amount == null ? "غير متتبع" : money.format(sale.remaining_amount)}</strong></div></div>
    <footer>{posted && sale.payment_tracking_enabled && Number(sale.remaining_amount) > 0 && <button type="button" onClick={addPayment}><CircleDollarSign size={15} />إضافة دفعة</button>}{session.role === "superuser" && posted && sale.payment_tracking_enabled && hasPaid && <button type="button" onClick={refund}>رد مبلغ</button>}{posted && ["pending", "ready"].includes(sale.delivery_status) && <button type="button" onClick={reschedule}>تعديل الموعد</button>}{posted && sale.delivery_status === "pending" && <button type="button" onClick={() => updateDelivery("ready")}><BadgeCheck size={15} />جاهز</button>}{posted && sale.delivery_status === "ready" && <button className="primary-action" type="button" onClick={() => updateDelivery("delivered")}><BadgeCheck size={15} />تم التسليم</button>}{session.role === "superuser" && posted && <button type="button" disabled={hasPaid} title={hasPaid ? "رد المبلغ أولاً" : "تعديل"} onClick={() => onEdit(sale.id)}><Pencil size={15} />تعديل</button>}{session.role === "superuser" && posted && <button type="button" disabled={hasPaid} onClick={() => correct("void", "سبب إلغاء العملية", "تم إلغاء العملية.")}><RotateCcw size={15} />إلغاء</button>}{session.role === "superuser" && posted && <button className="danger-action" type="button" disabled={hasPaid} onClick={() => correct("delete", "سبب حذف العملية", "تم حذف العملية مع حفظ الأثر.")}><Trash2 size={15} />حذف</button>}{session.role === "superuser" && !posted && <button type="button" onClick={() => correct("restore", "سبب استعادة العملية", "تمت استعادة العملية.")}><RotateCcw size={15} />استعادة</button>}</footer>
  </article>;
}

function bucket() { return { count: 0, remainingAmount: 0, sales: [] }; }
function statusLabel(status) { return status === "posted" ? "مسجلة" : status === "voided" ? "ملغاة" : "محذوفة"; }
function deliveryStatusLabel(status) { return status === "pending" ? "قيد التجهيز" : status === "ready" ? "جاهز للاستلام" : status === "delivered" ? "تم التسليم" : "ملغي"; }
function toDateInput(value) { if (!value) return ""; return String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ""; }
function isDateInput(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function formatDeliveryDate(value) { const date = toDateInput(value); if (!date) return "—"; const [year, month, day] = date.split("-").map(Number); return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day))); }
