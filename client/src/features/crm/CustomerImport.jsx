import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileUp, LoaderCircle, UploadCloud } from "lucide-react";
import * as XLSX from "xlsx";
import { crmApi } from "./crmApi.js";

const fields = [
  ["name", "اسم العميل"], ["phone", "رقم الهاتف"], ["identityNumber", "رقم الهوية"],
  ["birthYear", "سنة الميلاد"], ["sourceCode", "مصدر العميل"], ["address", "العنوان"],
];

export function CustomerImport({ inform, onCancel, onComplete }) {
  const [rows, setRows] = useState([]); const [headers, setHeaders] = useState([]); const [mapping, setMapping] = useState({}); const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const readFile = async (file) => {
    if (!file) return;
    try { setFile(file);
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]]; const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const hs = (matrix.shift() || []).map(String); const rs = matrix.filter(r => r.some(Boolean)).map(r => Object.fromEntries(hs.map((h, i) => [h, r[i] ?? ""])));
      setHeaders(hs); setRows(rs); setMapping(Object.fromEntries(fields.map(([key, label]) => [key, hs.find(h => h.trim().toLowerCase() === key.toLowerCase() || h.includes(label.replace("رقم ", ""))) || ""])));
    } catch { inform("تعذر قراءة الملف. تأكد أنه CSV أو Excel صالح.", "warning"); }
  };
  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const submit = async () => {
    if (!mapping.name || !mapping.phone) return inform("اربط عمود اسم العميل ورقم الهاتف أولاً.", "warning");
    setBusy(true); try {
      const response = await crmApi.importCustomers(file); setResult(response); inform("تم استيراد بيانات العملاء.");
    } catch (e) { inform(e.message || "فشل الاستيراد", "warning"); } finally { setBusy(false); }
  };
  if (result) return <article className="panel crm-import"><CheckCircle2 size={38} className="success-icon" /><h2>اكتمل استيراد العملاء</h2><p>تمت معالجة الملف وحفظ السجلات الجديدة أو تحديث المطابقة.</p><div className="import-result"><b>{result.created ?? result.imported ?? 0}</b><span>مضاف</span><b>{result.updated ?? 0}</b><span>محدّث</span><b>{result.failed ?? 0}</b><span>يحتاج مراجعة</span></div><button className="button primary" onClick={onComplete}>العودة إلى العملاء</button></article>;
  return <section className="crm-stack"><article className="panel crm-import"><button className="text-button" onClick={onCancel}><ArrowRight size={16} />العودة للعملاء</button><header className="crm-panel-title"><div><p className="eyebrow">استيراد جماعي</p><h2>استيراد بيانات العملاء</h2></div></header><p className="empty-copy">ارفع ملف CSV أو Excel، ثم اربط الأعمدة قبل الحفظ. لن يتم حذف أي عميل موجود.</p>
    <label className="import-drop"><UploadCloud size={30} /><strong>اختر ملف CSV أو XLSX</strong><span>الحد الأقصى 10 ميغابايت</span><input type="file" accept=".csv,.xlsx,.xls" onChange={e => readFile(e.target.files?.[0])} /></label>
    {headers.length > 0 && <><div className="import-mapping"><h3>ربط الأعمدة</h3>{fields.map(([key, label]) => <label key={key}>{label}<select value={mapping[key] || ""} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="">— غير مربوط —</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div><h3>معاينة أول 5 سجلات</h3><div className="crm-table-scroll"><table className="crm-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.map((r, i) => <tr key={i}>{headers.map(h => <td key={h}>{String(r[h]).slice(0, 40)}</td>)}</tr>)}</tbody></table></div><button className="button primary" disabled={busy} onClick={submit}>{busy && <LoaderCircle className="spin" size={16} />}<FileUp size={16} />بدء الاستيراد ({rows.length})</button></>}
  </article></section>;
}
