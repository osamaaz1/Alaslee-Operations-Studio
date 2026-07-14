// Provides the live-validated Arabic customer and optional prescription form.

import { useMemo, useState } from "react";
import { Save, UserRoundPlus } from "lucide-react";
import { customerCreateSchema } from "../../../../shared/crm/customerSchemas.js";
import { CountrySelect } from "./CountrySelect.jsx";
import { emptyPrescription, PrescriptionFields } from "./PrescriptionFields.jsx";

const emptyForm = {
  name: "", primaryPhone: { countryCode: "SA", number: "" }, hasWhatsapp: true,
  whatsappPhone: { countryCode: "SA", number: "" }, identityNumber: "", birthYear: "",
  sourceCode: "in_store", address: null, prescription: null,
};

export function CustomerForm({ sources, onSave, onCancel, onExistingCustomer, initialValue = emptyForm, editing = false }) {
  const [form, setForm] = useState(() => structuredClone(initialValue));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const parsed = useMemo(() => customerCreateSchema.safeParse(cleanPayload(form)), [form]);
  const errors = errorMap(parsed);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setShowErrors(true);
    if (!parsed.success) return;
    setBusy(true); setSubmitError(null);
    try { await onSave(parsed.data); if (!editing) setForm(emptyForm); setShowErrors(false); }
    catch (error) { setSubmitError({ message: error.message, details: error.details }); }
    finally { setBusy(false); }
  };
  const visibleError = (path, active = false) => (showErrors || active) ? findError(errors, path) : null;
  return <form className="customer-form panel" onSubmit={submit} noValidate>
    <header className="form-heading"><span><UserRoundPlus size={22} /></span><div><p className="eyebrow">{editing ? "تعديل محمي" : "ملف جديد"}</p><h2>{editing ? "تعديل بيانات العميل" : "إضافة عميل"}</h2></div></header>
    <section className="form-section"><h3>البيانات الأساسية</h3><div className="form-grid two">
      <Field label="اسم العميل" error={visibleError("name", Boolean(form.name))}><input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength="160" autoFocus /></Field>
      <Field label="مصدر العميل" error={visibleError("sourceCode")}><select value={form.sourceCode} onChange={(e) => set("sourceCode", e.target.value)}>{sources.map((source) => <option key={source.code} value={source.code}>{source.label_ar}</option>)}</select></Field>
      <PhoneField label="رقم الهاتف" value={form.primaryPhone} onChange={(value) => set("primaryPhone", value)} error={visibleError("primaryPhone", Boolean(form.primaryPhone.number))} />
      <label className="check-card"><input type="checkbox" checked={form.hasWhatsapp} onChange={(e) => set("hasWhatsapp", e.target.checked)} /><span><b>الرقم عليه واتساب</b><small>مفعّل افتراضياً</small></span></label>
      {!form.hasWhatsapp && <PhoneField label="رقم واتساب بديل" value={form.whatsappPhone} onChange={(value) => set("whatsappPhone", value)} error={visibleError("whatsappPhone", Boolean(form.whatsappPhone.number))} />}
      <Field label="رقم الهوية أو الإقامة · اختياري" error={visibleError("identityNumber", Boolean(form.identityNumber))}><input inputMode="numeric" value={form.identityNumber} onChange={(e) => set("identityNumber", digits(e.target.value, 10))} /></Field>
      <Field label="سنة الميلاد · اختياري" error={visibleError("birthYear", Boolean(form.birthYear))}><input inputMode="numeric" value={form.birthYear} onChange={(e) => set("birthYear", digits(e.target.value, 4))} placeholder="1990" /></Field>
    </div></section>
    <ToggleSection checked={Boolean(form.address)} onChange={(checked) => set("address", checked ? emptyAddress() : null)} label="إضافة العنوان الوطني السعودي" />
    {form.address && <AddressFields value={form.address} onChange={(value) => set("address", value)} errors={errors} />}
    <ToggleSection checked={Boolean(form.prescription)} onChange={(checked) => set("prescription", checked ? structuredClone(emptyPrescription) : null)} label="يوجد كشف طبي" />
    {form.prescription && <PrescriptionFields value={form.prescription} onChange={(value) => set("prescription", value)} errors={nestedErrors(errors, "prescription")} />}
    {showErrors && !parsed.success && <div className="form-alert" role="alert">تحقق من الحقول المحددة قبل الحفظ.</div>}
    {submitError && <div className="form-alert duplicate-customer-alert" role="alert"><span>{submitError.message}</span>{submitError.details?.customerId && onExistingCustomer && <button type="button" onClick={() => onExistingCustomer(submitError.details.customerId)}>فتح ملف العميل</button>}</div>}
    <div className="form-actions"><button className="button secondary" type="button" onClick={onCancel}>إلغاء</button><button className="button primary" type="submit" disabled={busy}><Save size={17} />{busy ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "حفظ العميل"}</button></div>
  </form>;
}

function PhoneField({ label, value, onChange, error }) {
  return <Field label={label} error={error}><div className="phone-input"><CountrySelect value={value.countryCode} onChange={(countryCode) => onChange({ ...value, countryCode })} /><input dir="ltr" inputMode="tel" value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder="05XXXXXXXX" /></div></Field>;
}

function AddressFields({ value, onChange, errors }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return <section className="form-section address-section"><h3>العنوان الوطني · السعودية</h3><div className="form-grid three">
    <Field label="رقم المبنى" error={errors["address.buildingNumber"]}><input inputMode="numeric" value={value.buildingNumber} onChange={(e) => set("buildingNumber", digits(e.target.value, 4))} /></Field>
    <Field label="اسم الشارع" error={errors["address.streetName"]}><input value={value.streetName} onChange={(e) => set("streetName", e.target.value)} /></Field>
    <Field label="الرقم الثانوي" error={errors["address.secondaryNumber"]}><input inputMode="numeric" value={value.secondaryNumber} onChange={(e) => set("secondaryNumber", digits(e.target.value, 4))} /></Field>
    <Field label="الحي" error={errors["address.district"]}><input value={value.district} onChange={(e) => set("district", e.target.value)} /></Field>
    <Field label="المدينة" error={errors["address.city"]}><input value={value.city} onChange={(e) => set("city", e.target.value)} /></Field>
    <Field label="الرمز البريدي" error={errors["address.postalCode"]}><input inputMode="numeric" value={value.postalCode} onChange={(e) => set("postalCode", digits(e.target.value, 5))} /></Field>
    <Field label="العنوان المختصر" error={errors["address.shortAddress"]}><input dir="ltr" value={value.shortAddress} onChange={(e) => set("shortAddress", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="ABCD1234" /></Field>
  </div></section>;
}

function ToggleSection({ checked, onChange, label }) { return <label className="section-toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>; }
function Field({ label, error, children }) { return <label className="crm-field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>; }
function digits(value, length) { return value.replace(/\D/g, "").slice(0, length); }
function emptyAddress() { return { countryCode: "SA", buildingNumber: "", streetName: "", secondaryNumber: "", district: "", city: "", postalCode: "", shortAddress: "" }; }
function cleanPayload(form) { const next = structuredClone(form); if (next.prescription) delete next.prescription.exceptionalEntry; return next; }
function errorMap(result) { if (result.success) return {}; return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message])); }
function findError(errors, path) { const key = Object.keys(errors).find((item) => item === path || item.startsWith(`${path}.`)); return key ? errors[key] : null; }
function nestedErrors(errors, prefix) { return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(`${prefix}.`)).map(([key, value]) => [key.slice(prefix.length + 1), value])); }
