// Presents Arabic local PIN authentication and configuration status.

import { useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";

export function CrmLogin({ configured, onLogin }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await onLogin(pin); } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  };
  if (!configured) return <section className="crm-setup panel">
    <ShieldCheck size={34} /><h2>إدارة العملاء تحتاج إلى تهيئة محلية</h2>
    <p>شغّل PostgreSQL ثم أضف إعدادات CRM_DATABASE_URL ومفتاح التشفير ورمزي الموظفين والمشرف داخل ملف البيئة.</p>
    <code>npm run crm:db:up<br />npm run crm:migrate<br />npm run dev</code>
  </section>;
  return <section className="crm-login panel">
    <span className="crm-login-icon"><KeyRound size={28} /></span>
    <p className="eyebrow">دخول محمي</p><h2>أدخل رمز إدارة العملاء</h2>
    <p>رمز الموظفين يفتح العمل اليومي، ورمز المشرف يفتح أدوات الإدارة والتصحيح.</p>
    <form onSubmit={submit}><label>رمز الدخول<input type="password" inputMode="numeric" pattern="\d{4,12}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} autoComplete="current-password" required /></label>
      {error && <div className="field-error" role="alert">{error}</div>}
      <button className="button primary wide" type="submit" disabled={busy || pin.length < 4}>{busy ? <><LoaderCircle className="spin" size={17} />جارٍ التحقق</> : "دخول"}</button>
    </form>
  </section>;
}
