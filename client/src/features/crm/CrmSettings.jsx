// Provides superuser scoring, import, and Daftra synchronization controls.

import { useCallback, useEffect, useState } from "react";
import { Database, Download, GitMerge, RefreshCw, ShieldCheck } from "lucide-react";
import { crmApi } from "./crmApi.js";

export function CrmSettings({ session, inform, onLogout }) {
  const [sync, setSync] = useState(null);
  const [rules, setRules] = useState(null);
  const [imports, setImports] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const [syncValue, rulesValue] = await Promise.all([crmApi.syncStatus(), crmApi.rfmRules()]);
    setSync(syncValue); setRules(rulesValue.rules || rulesValue);
    if (session.role === "superuser") {
      const [importRows, candidateRows, customerRows] = await Promise.all([crmApi.imports(), crmApi.importCandidates(), crmApi.customers()]);
      setImports(importRows); setCandidates(candidateRows); setCustomers(customerRows);
    }
  }, [session.role]);
  useEffect(() => { load().catch((error) => inform(error.message, "warning")); }, [load, inform]);
  const action = async (name, task, success) => { setBusy(name); try { await task(); inform(success); await load(); } catch (error) { inform(error.message, "warning"); } finally { setBusy(""); } };

  return <section className="crm-stack"><div className="settings-cards"><article className="panel setting-card"><span className="setting-icon"><Database size={22} /></span><p className="eyebrow">دفترة</p><h2>مزامنة المنتجات والمخزون</h2><StatusLine label="حالة الربط" value={sync?.configured ? "مهيأ" : "غير مهيأ"} ready={sync?.configured} /><StatusLine label="آخر مزامنة" value={sync?.latest?.completed_at ? new Date(sync.latest.completed_at).toLocaleString("ar-SA-u-nu-latn") : "لا توجد"} ready={sync?.freshness === "fresh"} />{session.role === "superuser" && <button className="button secondary wide" type="button" disabled={busy === "sync"} onClick={() => action("sync", crmApi.syncNow, "بدأ تحديث بيانات دفترة.")}><RefreshCw size={16} />تحديث الآن</button>}</article>
    <article className="panel setting-card"><span className="setting-icon"><ShieldCheck size={22} /></span><p className="eyebrow">الجلسة</p><h2>صلاحية الدخول الحالية</h2><strong className="role-title">{session.role === "superuser" ? "المشرف الأعلى" : "الموظفون"}</strong><p>البيانات الحساسة محمية، وتُسجل العمليات الإدارية في سجل غير قابل للتعديل.</p><button className="button secondary wide" type="button" onClick={onLogout}>تسجيل الخروج</button></article></div>
    {session.role === "superuser" && <><RfmEditor rules={rules} onChange={setRules} onSave={() => action("rules", () => crmApi.updateRfmRules(rules), "تم تحديث قواعد التصنيف.")} busy={busy === "rules"} /><article className="panel"><header className="crm-panel-title"><div><p className="eyebrow">البيانات السابقة</p><h2>استيراد سجل العملاء والمبيعات</h2></div><button className="button secondary" type="button" disabled={busy === "import"} onClick={() => action("import", crmApi.importHistory, "اكتمل الاستيراد وأعيد حساب التصنيفات.")}><Download size={16} />استيراد آمن</button></header><div className="import-list">{imports.length ? imports.map((item) => <div key={item.id}><span className={`sale-status ${item.status}`}>{importStatus(item.status)}</span><strong>{new Date(item.created_at).toLocaleString("ar-SA-u-nu-latn")}</strong><small>{item.customers_count} عملاء · {item.sales_count} عمليات · {item.candidates_count} للمراجعة</small></div>) : <p className="empty-copy">لم تنفذ عملية استيراد بعد.</p>}</div></article>
      <CandidateReview candidates={candidates} customers={customers} busy={busy} decide={(id, payload) => action(`candidate-${id}`, () => crmApi.decideImportCandidate(id, payload), "تم حفظ قرار المراجعة.")} /></>}
  </section>;
}

function RfmEditor({ rules, onChange, onSave, busy }) { if (!rules) return null; return <article className="panel"><header className="crm-panel-title"><div><p className="eyebrow">تصنيف ذكي وشفاف</p><h2>حدود RFM</h2></div><button className="button primary" type="button" onClick={onSave} disabled={busy}>حفظ القواعد</button></header><div className="rfm-editor"><Thresholds label="الحداثة · أيام" values={rules.recencyDays} onChange={(values) => onChange({ ...rules, recencyDays: values })} /><Thresholds label="التكرار · عمليات" values={rules.frequency} onChange={(values) => onChange({ ...rules, frequency: values })} /><Thresholds label="القيمة · ر.س" values={rules.monetary} onChange={(values) => onChange({ ...rules, monetary: values })} /></div></article>; }
function Thresholds({ label, values, onChange }) { return <label className="threshold-row"><span>{label}</span><div>{values.map((value, index) => <input key={index} type="number" min="0" value={value} onChange={(e) => onChange(values.map((item, itemIndex) => itemIndex === index ? Number(e.target.value) : item))} />)}</div></label>; }
function StatusLine({ label, value, ready }) { return <div className="status-line"><span>{label}</span><strong><i className={ready ? "ready" : ""}></i>{value}</strong></div>; }

function CandidateReview({ candidates, customers, busy, decide }) {
  const [choices, setChoices] = useState({});
  if (!candidates.length) return <article className="panel"><header className="crm-panel-title"><div><GitMerge size={18} /><h2>مراجعة سجلات الاستيراد</h2></div></header><p className="empty-copy">لا توجد سجلات معلقة للمراجعة.</p></article>;
  return <article className="panel"><header className="crm-panel-title"><div><GitMerge size={18} /><p className="eyebrow">قرار بشري موثق</p><h2>مراجعة سجلات الاستيراد</h2></div><span>{candidates.length}</span></header><div className="candidate-list">{candidates.map((item) => <div key={item.id}><div><strong>{item.evidence?.name || item.source_key}</strong><small>{item.evidence?.reason} · رقم المصدر {item.source_key}</small><small className="candidate-phone">الهاتف المُدرج: <b dir="ltr">{item.evidence?.phone || "غير مسجل في الملف"}</b></small></div><select value={choices[item.id] || ""} onChange={(event) => setChoices((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">اختر عميلاً للربط</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone_last4}</option>)}</select><div className="candidate-actions"><button type="button" disabled={!choices[item.id] || busy === `candidate-${item.id}`} onClick={() => decide(item.id, { status: "merged", customerId: choices[item.id] })}>ربط واستيراد الفواتير</button><button type="button" onClick={() => decide(item.id, { status: "separate" })}>إبقاؤه منفصلاً</button><button type="button" onClick={() => decide(item.id, { status: "ignored" })}>تجاهل</button></div></div>)}</div></article>;
}

function importStatus(status) { return status === "completed" ? "مكتمل" : status === "review" ? "للمراجعة" : status === "running" ? "جارٍ" : "فشل"; }
