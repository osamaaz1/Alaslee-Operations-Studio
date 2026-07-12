// Provides the audited, superuser-only Arabic store-account credential vault.

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, Pencil, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { ACCOUNT_CREDENTIAL_KINDS, ACCOUNT_PROVIDER_OPTIONS } from "../../../../shared/crm/accountVaultConstants.js";
import { CrmLogin } from "../crm/CrmLogin.jsx";
import { crmApi } from "../crm/crmApi.js";

const emptyEntry = { providerCode: "facebook", providerLabelAr: "", accountLabel: "", credentialKind: "password", login: "", secret: "", url: "", notes: "" };

export function AccountVault({ inform }) {
  const [session, setSession] = useState(undefined);
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [revealed, setRevealed] = useState("");
  const [mode, setMode] = useState("list");

  const load = useCallback(async (nextQuery = "") => {
    try { setEntries(await crmApi.vaultEntries(nextQuery)); } catch (error) { inform(error.message, "warning"); }
  }, [inform]);
  useEffect(() => { crmApi.session().then((next) => { setSession(next); if (next.role === "superuser") load(); }).catch(() => setSession(null)); }, [load]);
  const choose = async (id) => {
    try { setRevealed(""); setDetail(await crmApi.vaultEntry(id)); setMode("detail"); } catch (error) { inform(error.message, "warning"); }
  };
  const reveal = async () => {
    try {
      const result = await crmApi.revealVaultSecret(detail.id); setRevealed(result.secret);
      window.setTimeout(() => setRevealed((current) => current === result.secret ? "" : current), 30_000);
      inform("ستختفي كلمة المرور تلقائيًا بعد 30 ثانية.");
    } catch (error) { inform(error.message, "warning"); }
  };
  const search = (event) => { event.preventDefault(); load(query.trim()); };
  if (session === undefined) return <div className="vault-loading"><KeyRound className="spin" size={26} />جارٍ التحقق من صلاحية الوصول…</div>;
  if (!session) return <VaultLogin onLogin={async (pin) => { const next = await crmApi.login(pin); setSession(next); window.dispatchEvent(new Event("crm-session-change")); if (next.role === "superuser") await load(); }} />;
  if (session.role !== "superuser") return <VaultDenied />;
  if (mode === "new" || mode === "edit") return <VaultForm initial={mode === "edit" ? detail : emptyEntry} editing={mode === "edit"} onCancel={() => setMode(detail ? "detail" : "list")} onSave={async (payload) => {
    const next = mode === "edit" ? await crmApi.updateVaultEntry(detail.id, payload) : await crmApi.createVaultEntry(payload);
    inform(mode === "edit" ? "تم تحديث الحساب وحفظ بياناته بتشفير محمي." : "تمت إضافة الحساب وحفظ بياناته بتشفير محمي.");
    await load(query); setDetail(next); setRevealed(""); setMode("detail");
  }} />;
  if (mode === "detail" && detail) return <VaultDetail entry={detail} revealed={revealed} onBack={() => { setDetail(null); setRevealed(""); setMode("list"); }} onReveal={reveal} onEdit={() => setMode("edit")} onDelete={async () => {
    if (!window.confirm("هل تريد إزالة هذا الحساب من السجل النشط؟")) return;
    await crmApi.deleteVaultEntry(detail.id); inform("تمت إزالة الحساب من السجل النشط."); await load(query); setDetail(null); setMode("list");
  }} />;
  return <section className="section-stack vault-workspace"><VaultHeading /><div className="vault-toolbar panel"><form onSubmit={search} className="vault-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الحساب أو المنصة" /><button type="submit">بحث</button></form><button className="button primary" type="button" onClick={() => setMode("new")}><Plus size={17} />إضافة حساب</button></div><article className="panel vault-list-panel"><header className="crm-panel-title"><div><p className="eyebrow">مركز الحسابات</p><h2>الحسابات وكلمات المرور</h2></div><span>{entries.length} حساب</span></header><div className="crm-table-scroll"><table className="crm-table vault-table"><thead><tr><th>المنصة</th><th>اسم الحساب</th><th>نوع بيانات الدخول</th><th>الرابط</th><th>آخر تحديث</th><th></th></tr></thead><tbody>{entries.length ? entries.map((entry) => <tr key={entry.id}><td><span className="vault-provider">{entry.provider_label_ar}</span></td><td><strong>{entry.account_label}</strong></td><td>{credentialLabel(entry.credential_kind)}</td><td>{entry.url ? <a className="vault-link" href={entry.url} target="_blank" rel="noreferrer">فتح المنصة</a> : "—"}</td><td dir="ltr">{new Date(entry.updated_at).toLocaleString("ar-SA-u-nu-latn")}</td><td><button type="button" className="row-action" onClick={() => choose(entry.id)}>إدارة</button></td></tr>) : <tr><td colSpan="6"><div className="crm-empty"><LockKeyhole size={30} /><strong>لا توجد حسابات محفوظة</strong><span>أضف أول حساب للمتجر بتشفير محمي.</span></div></td></tr>}</tbody></table></div></article></section>;
}

function VaultHeading() { return <header className="page-title"><div><p className="eyebrow">وصول محمي · المشرف الأعلى فقط</p><h1>الحسابات وكلمات المرور</h1><p>مركز مشفر للحسابات التشغيلية وكلمات المرور ومفاتيح الربط الخاصة بالمحل.</p></div><span className="vault-superuser"><LockKeyhole size={16} />محمي</span></header>; }
function VaultLogin({ onLogin }) { return <section className="vault-login"><VaultHeading /><CrmLogin configured onLogin={onLogin} /></section>; }
function VaultDenied() { return <section className="vault-denied panel"><ShieldAlert size={34} /><h2>هذه المساحة للمشرف الأعلى فقط</h2><p>الحسابات وكلمات المرور لا تظهر للموظفين، ولا يمكن الوصول إلى بياناتها عبر النظام.</p></section>; }
function VaultDetail({ entry, revealed, onBack, onReveal, onEdit, onDelete }) { return <section className="vault-detail section-stack"><VaultHeading /><article className="panel"><header className="vault-detail-head"><button type="button" className="text-button" onClick={onBack}>العودة للحسابات</button><div><span className="vault-provider">{entry.providerLabelAr}</span><h2>{entry.accountLabel}</h2><small>{credentialLabel(entry.credentialKind)}</small></div></header><div className="vault-detail-grid"><VaultValue label="اسم المستخدم أو البريد" value={entry.login || "غير مسجل"} ltr /><VaultValue label="رابط المنصة" value={entry.url || "غير مسجل"} link /><section className="vault-secret"><span>كلمة المرور أو بيانات الدخول</span>{revealed ? <strong dir="ltr">{revealed}</strong> : <strong>••••••••••</strong>}<button type="button" className="button secondary" onClick={onReveal}>{revealed ? <EyeOff size={16} /> : <Eye size={16} />}{revealed ? "ستختفي تلقائيًا" : "كشف كلمة المرور"}</button><small>كل عملية كشف تُسجل في سجل الأمان.</small></section><VaultValue label="ملاحظات خاصة" value={entry.notes || "لا توجد ملاحظات"} /></div><div className="vault-actions"><button type="button" className="button secondary" onClick={onEdit}><Pencil size={16} />تعديل</button><button type="button" className="button danger" onClick={onDelete}><Trash2 size={16} />إزالة</button></div></article></section>; }
function VaultValue({ label, value, ltr, link }) { return <section className="vault-value"><span>{label}</span>{link && value !== "غير مسجل" ? <a href={value} target="_blank" rel="noreferrer">فتح الرابط</a> : <strong dir={ltr ? "ltr" : undefined}>{value}</strong>}</section>; }
function VaultForm({ initial, editing, onCancel, onSave }) { const [form, setForm] = useState(() => ({ ...emptyEntry, ...initial, secret: "" })); const [busy, setBusy] = useState(false); const set = (key, value) => setForm((current) => ({ ...current, [key]: value })); const submit = async (event) => { event.preventDefault(); if (!editing && !form.secret.trim()) return; setBusy(true); try { const payload = { ...form, secret: form.secret.trim() || undefined }; await onSave(payload); } finally { setBusy(false); } }; return <section className="vault-form section-stack"><VaultHeading /><form className="panel" onSubmit={submit}><header className="crm-panel-title"><div><p className="eyebrow">{editing ? "تعديل محمي" : "سجل جديد"}</p><h2>{editing ? "تعديل حساب" : "إضافة حساب جديد"}</h2></div></header><div className="form-grid two"><Field label="المنصة"><select value={form.providerCode} onChange={(event) => set("providerCode", event.target.value)}>{ACCOUNT_PROVIDER_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></Field>{form.providerCode === "other" && <Field label="اسم المنصة أو الخدمة"><input value={form.providerLabelAr} onChange={(event) => set("providerLabelAr", event.target.value)} required /></Field>}<Field label="اسم الحساب"><input value={form.accountLabel} onChange={(event) => set("accountLabel", event.target.value)} required autoFocus /></Field><Field label="نوع بيانات الدخول"><select value={form.credentialKind} onChange={(event) => set("credentialKind", event.target.value)}>{ACCOUNT_CREDENTIAL_KINDS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></Field><Field label="اسم المستخدم أو البريد · اختياري"><input dir="ltr" value={form.login || ""} onChange={(event) => set("login", event.target.value)} /></Field><Field label={editing ? "كلمة مرور جديدة · اتركه فارغًا للإبقاء عليها" : "كلمة المرور أو بيانات الدخول"}><input dir="ltr" type="password" value={form.secret} onChange={(event) => set("secret", event.target.value)} required={!editing} autoComplete="new-password" /></Field><Field label="رابط المنصة · اختياري"><input dir="ltr" type="url" value={form.url || ""} onChange={(event) => set("url", event.target.value)} placeholder="https://" /></Field><Field label="ملاحظات خاصة · اختياري"><textarea value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></Field></div><div className="vault-actions"><button className="button secondary" type="button" onClick={onCancel}>إلغاء</button><button className="button primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "حفظ الحساب"}</button></div></form></section>; }
function Field({ label, children }) { return <label className="crm-field"><span>{label}</span>{children}</label>; }
function credentialLabel(value) { return ACCOUNT_CREDENTIAL_KINDS.find((item) => item.code === value)?.label || "بيانات دخول"; }
