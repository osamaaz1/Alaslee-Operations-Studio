// Lists, searches, creates, and inspects CRM customers in Arabic.

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Download, FileDown, FileUp, Pencil, Plus, Search, UserRound, WalletCards } from "lucide-react";
import { crmApi } from "./crmApi.js";
import { CustomerForm } from "./CustomerForm.jsx";
import { CustomerImport } from "./CustomerImport.jsx";

export function CustomerList({ session, inform }) {
  const [customers, setCustomers] = useState([]);
  const [sources, setSources] = useState([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState("");
  const load = useCallback(async (search = "") => {
    const [customerRows, sourceRows] = await Promise.all([crmApi.customers(search), crmApi.sources()]);
    setCustomers(customerRows); setSources(sourceRows);
  }, []);
  useEffect(() => { load().catch((error) => inform(error.message, "warning")); }, [load, inform]);

  const exportCustomers = async (format) => {
    setExporting(format);
    try {
      const response = await crmApi.exportCustomers(format, query);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
      const fallback = `customers-${new Date().toISOString().slice(0, 10)}.${format === "xlsx" ? "xlsx" : "csv"}`;
      const filename = match ? decodeURIComponent(match[1]) : fallback;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      inform(`تم تصدير بيانات العملاء بصيغة ${format === "xlsx" ? "Excel" : "CSV"}.`);
    } catch (error) { inform(error.message, "warning"); } finally { setExporting(""); }
  };

  if (mode === "new") return <CustomerForm sources={sources} onCancel={() => setMode("list")} onSave={async (payload) => {
    const customer = await crmApi.createCustomer(payload); inform("تم حفظ العميل بنجاح."); await load(); setSelected(customer); setMode("profile");
  }} />;
  if (mode === "import") return <CustomerImport inform={inform} onCancel={() => setMode("list")} onComplete={async () => { await load(); setMode("list"); }} />;
  if (mode === "edit" && selected) return <CustomerForm editing sources={sources} initialValue={customerFormValue(selected)} onCancel={() => setMode("profile")} onSave={async (payload) => {
    const customer = await crmApi.updateCustomer(selected.id, payload); inform("تم حفظ تعديلات العميل."); setSelected(customer); setMode("profile"); await load();
  }} />;
  if (mode === "profile" && selected) return <CustomerProfile customerId={selected.id} session={session} inform={inform} onEdit={(customer) => { setSelected(customer); setMode("edit"); }} onBack={() => { setMode("list"); setSelected(null); load(); }} />;

  return <section className="crm-stack">
    <div className="crm-toolbar panel"><form onSubmit={(event) => { event.preventDefault(); load(query).catch((error) => inform(error.message, "warning")); }} className="crm-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف أو الهوية" /><button type="submit">بحث</button></form>
      <div className="crm-toolbar-actions"><button className="button secondary" type="button" onClick={() => setMode("import")}><FileUp size={17} />استيراد بيانات</button><button className="button secondary" type="button" disabled={Boolean(exporting)} onClick={() => exportCustomers("csv")}><Download size={17} />{exporting === "csv" ? "جارٍ التصدير…" : "تصدير CSV"}</button><button className="button secondary" type="button" disabled={Boolean(exporting)} onClick={() => exportCustomers("xlsx")}><FileDown size={17} />{exporting === "xlsx" ? "جارٍ التصدير…" : "تصدير Excel"}</button><button className="button primary" type="button" onClick={() => setMode("new")}><Plus size={17} />إضافة عميل</button></div></div>
    <article className="panel crm-table-panel"><header className="crm-panel-title"><div><p className="eyebrow">سجل العملاء</p><h2>بيانات العملاء</h2></div><span>{customers.length} عميل</span></header>
      <div className="crm-table-scroll"><table className="crm-table"><thead><tr><th>العميل</th><th>الهاتف</th><th>المصدر</th><th></th></tr></thead><tbody>
        {customers.length ? customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td dir="ltr">•••• {customer.phone_last4}</td><td>{customer.source_label}</td><td><button className="row-action" type="button" onClick={() => { setSelected(customer); setMode("profile"); }}>عرض<ChevronLeft size={15} /></button></td></tr>) : <tr><td colSpan="4"><EmptyCustomers /></td></tr>}
      </tbody></table></div>
    </article>
  </section>;
}

function CustomerProfile({ customerId, session, inform, onBack, onEdit }) {
  const [customer, setCustomer] = useState(null);
  useEffect(() => { crmApi.customer(customerId).then(setCustomer).catch((error) => inform(error.message, "warning")); }, [customerId, inform]);
  if (!customer) return <div className="panel crm-loading">جارٍ تحميل ملف العميل…</div>;
  return <section className="crm-stack">
    <div className="profile-head panel"><button type="button" className="text-button" onClick={onBack}>العودة للعملاء</button><div className="profile-identity"><span><UserRound size={25} /></span><div><p className="eyebrow">ملف العميل</p><h2>{customer.name}</h2><small dir="ltr">{customer.primaryPhone?.e164}</small></div></div>
      <span className="segment-badge">{customer.source?.label}</span></div>
    <div className="profile-grid"><article className="panel"><PanelTitle title="البيانات الشخصية" /><dl className="detail-list"><Detail label="الهاتف" value={customer.primaryPhone?.e164} ltr /><Detail label="واتساب" value={customer.whatsappPhone?.e164 || "غير متاح"} ltr /><Detail label="الهوية / الإقامة" value={customer.identity?.number || "غير مسجل"} ltr /><Detail label="سنة الميلاد" value={customer.birthYear || "غير مسجلة"} /></dl></article>
      <article className="panel"><PanelTitle title="العنوان الوطني" /><dl className="detail-list">{customer.address ? <><Detail label="العنوان المختصر" value={customer.address.shortAddress} ltr /><Detail label="الموقع" value={`${customer.address.streetName}، ${customer.address.district}، ${customer.address.city}`} /><Detail label="الرمز البريدي" value={customer.address.postalCode} ltr /></> : <Detail label="الحالة" value="لم يضف عنوان" />}</dl></article></div>
    <article className="panel"><PanelTitle title="سجل الكشف الطبي" icon={WalletCards} /><div className="rx-history">{customer.prescriptions?.length ? customer.prescriptions.map((item) => <RxSummary item={item} key={item.id} />) : <p className="empty-copy">لا يوجد كشف طبي محفوظ لهذا العميل.</p>}</div></article>
    {session.role === "superuser" && <div className="superuser-strip"><span>وضع المشرف الأعلى فعّال</span><div><button type="button" onClick={() => onEdit(customer)}><Pencil size={14} />تعديل البيانات</button><button type="button" onClick={async () => { if (!window.confirm("هل تريد حذف العميل من السجل النشط؟")) return; await crmApi.deleteCustomer(customer.id); inform("تم حذف العميل من السجل النشط."); onBack(); }}>حذف العميل</button></div></div>}
  </section>;
}

function RxSummary({ item }) { const value = item.values || {}; return <article className="rx-summary"><header><strong>{new Date(item.exam_date).toLocaleDateString("ar-SA-u-nu-latn")}</strong>{item.exceptional && <span>قيمة استثنائية</span>}</header><div><b>Right</b><small>SPH {value.right?.sph ?? "—"}</small><small>CYL {value.right?.cyl ?? "—"}</small><small>Axis {value.right?.axis || "—"}</small><small>ADD {value.right?.add || "—"}</small></div><div><b>Left</b><small>SPH {value.left?.sph ?? "—"}</small><small>CYL {value.left?.cyl ?? "—"}</small><small>Axis {value.left?.axis || "—"}</small><small>ADD {value.left?.add || "—"}</small></div><footer>IPD: {value.pdMode === "binocular" ? value.binocularPd : `${value.rightPd} / ${value.leftPd}`}</footer></article>; }
function PanelTitle({ title, icon: Icon }) { return <header className="crm-panel-title"><div>{Icon && <Icon size={18} />}<h2>{title}</h2></div></header>; }
function Detail({ label, value, ltr }) { return <div><dt>{label}</dt><dd dir={ltr ? "ltr" : undefined}>{value}</dd></div>; }
function EmptyCustomers() { return <div className="crm-empty"><UserRound size={28} /><strong>لا توجد نتائج</strong><span>أضف أول عميل أو غيّر عبارة البحث.</span></div>; }

function customerFormValue(customer) {
  return {
    name: customer.name,
    primaryPhone: phoneValue(customer.primaryPhone),
    hasWhatsapp: customer.hasWhatsapp,
    whatsappPhone: phoneValue(customer.whatsappPhone || customer.primaryPhone),
    identityNumber: customer.identity?.number || "",
    birthYear: customer.birthYear || "",
    sourceCode: customer.source.code,
    address: customer.address ? { ...customer.address, countryCode: "SA" } : null,
    prescription: null,
  };
}

function phoneValue(phone) { return { countryCode: phone?.countryCode || "SA", number: phone?.e164 || "" }; }
