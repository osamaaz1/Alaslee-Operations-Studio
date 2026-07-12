// Provides non-financial inventory synchronization and session controls.

import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";
import { crmApi } from "./crmApi.js";

export function CrmSettings({ session, inform, onLogout }) {
  const [sync, setSync] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setSync(await crmApi.syncStatus()), []);
  useEffect(() => { load().catch((error) => inform(error.message, "warning")); }, [load, inform]);
  const syncNow = async () => {
    setBusy(true);
    try { await crmApi.syncNow(); inform("بدأ تحديث بيانات المنتجات والمخزون."); await load(); }
    catch (error) { inform(error.message, "warning"); }
    finally { setBusy(false); }
  };

  return <section className="crm-stack"><div className="settings-cards">
    <article className="panel setting-card"><span className="setting-icon"><Database size={22} /></span><p className="eyebrow">المخزون</p><h2>مزامنة المنتجات والكميات</h2><StatusLine label="حالة الربط" value={sync?.configured ? "مهيأ" : "غير مهيأ"} ready={sync?.configured} /><StatusLine label="آخر مزامنة" value={sync?.latest?.completed_at ? new Date(sync.latest.completed_at).toLocaleString("ar-SA-u-nu-latn") : "لا توجد"} ready={sync?.freshness === "fresh"} />{session.role === "superuser" && <button className="button secondary wide" type="button" disabled={busy} onClick={syncNow}><RefreshCw size={16} />تحديث الآن</button>}</article>
    <article className="panel setting-card"><span className="setting-icon"><ShieldCheck size={22} /></span><p className="eyebrow">الجلسة</p><h2>صلاحية الدخول الحالية</h2><strong className="role-title">{session.role === "superuser" ? "المشرف الأعلى" : "الموظفون"}</strong><p>البيانات الحساسة محمية، وتُسجل العمليات الإدارية في سجل غير قابل للتعديل.</p><button className="button secondary wide" type="button" onClick={onLogout}>تسجيل الخروج</button></article>
  </div></section>;
}

function StatusLine({ label, value, ready }) { return <div className="status-line"><span>{label}</span><strong><i className={ready ? "ready" : ""}></i>{value}</strong></div>; }
