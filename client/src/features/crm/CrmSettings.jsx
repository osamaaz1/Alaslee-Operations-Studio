// Provides non-financial inventory synchronization and session controls.

import { useCallback, useEffect, useState } from "react";
import { Database, FileInput, RefreshCw, ShieldCheck } from "lucide-react";
import { crmApi } from "./crmApi.js";

export function CrmSettings({ session, inform, onLogout }) {
  const [sync, setSync] = useState(null);
  const [imports, setImports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const load = useCallback(async () => {
    const [syncStatus, importRows] = await Promise.all([
      crmApi.syncStatus(),
      session.role === "superuser" ? crmApi.imports() : Promise.resolve([]),
    ]);
    setSync(syncStatus);
    setImports(importRows);
  }, [session.role]);
  useEffect(() => { load().catch((error) => inform(error.message, "warning")); }, [load, inform]);
  const syncNow = async () => {
    setBusy(true);
    try { await crmApi.syncNow(); inform("بدأ تحديث بيانات المنتجات والمخزون."); await load(); }
    catch (error) { inform(error.message, "warning"); }
    finally { setBusy(false); }
  };
  const importAnalyzedHistory = async () => {
    setImportBusy(true);
    try {
      const result = await crmApi.importHistory();
      inform(result.customers
        ? `تم استيراد ${result.customers} عميلاً من بيانات التحليل.`
        : "تمت مراجعة بيانات التحليل ولا توجد سجلات عملاء جديدة.");
      await load();
    } catch (error) { inform(error.message, "warning"); }
    finally { setImportBusy(false); }
  };
  const latestImport = imports[0] || null;
  const historyImported = imports.some((batch) => Number(batch.customers_count || 0) > 0 || Number(batch.candidates_count || 0) > 0);

  return <section className="crm-stack"><div className="settings-cards">
    <article className="panel setting-card"><span className="setting-icon"><Database size={22} /></span><p className="eyebrow">المخزون</p><h2>مزامنة المنتجات والكميات</h2><StatusLine label="حالة الربط" value={sync?.configured ? "مهيأ" : "غير مهيأ"} ready={sync?.configured} /><StatusLine label="آخر مزامنة" value={sync?.latest?.completed_at ? new Date(sync.latest.completed_at).toLocaleString("ar-SA-u-nu-latn") : "لا توجد"} ready={sync?.freshness === "fresh"} />{session.role === "superuser" && <button className="button secondary wide" type="button" disabled={busy} onClick={syncNow}><RefreshCw size={16} />تحديث الآن</button>}</article>
    {session.role === "superuser" && <article className="panel setting-card"><span className="setting-icon"><FileInput size={22} /></span><p className="eyebrow">بيانات التحليل</p><h2>استيراد سجل العملاء</h2><StatusLine label="آخر معالجة" value={latestImport?.created_at ? new Date(latestImport.created_at).toLocaleString("ar-SA-u-nu-latn") : "لم يبدأ"} ready={Boolean(latestImport)} /><StatusLine label="حالة الدفعة" value={importStatus(latestImport?.status)} ready={latestImport?.status === "completed" || latestImport?.status === "review"} /><button className="button secondary wide" type="button" disabled={importBusy || historyImported} onClick={importAnalyzedHistory}><FileInput size={16} />{importBusy ? "جارٍ الاستيراد…" : historyImported ? "تم استيراد بيانات التحليل" : "استيراد بيانات التحليل"}</button></article>}
    <article className="panel setting-card"><span className="setting-icon"><ShieldCheck size={22} /></span><p className="eyebrow">الجلسة</p><h2>صلاحية الدخول الحالية</h2><strong className="role-title">{session.role === "superuser" ? "المشرف الأعلى" : "الموظفون"}</strong><p>البيانات الحساسة محمية، وتُسجل العمليات الإدارية في سجل غير قابل للتعديل.</p><button className="button secondary wide" type="button" onClick={onLogout}>تسجيل الخروج</button></article>
  </div></section>;
}

function StatusLine({ label, value, ready }) { return <div className="status-line"><span>{label}</span><strong><i className={ready ? "ready" : ""}></i>{value}</strong></div>; }
function importStatus(status) {
  if (status === "completed") return "مكتملة";
  if (status === "review") return "تحتاج مراجعة";
  if (status === "running") return "قيد التنفيذ";
  if (status === "failed") return "فشلت";
  return "لا توجد دفعة";
}
