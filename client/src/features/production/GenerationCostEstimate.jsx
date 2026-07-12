import { useEffect, useState } from "react";
import { CircleDollarSign, ImageDown, LoaderCircle, Maximize2, X } from "lucide-react";
import { get } from "../../api.js";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 1 });

export function GenerationCostEstimate({ productId, batchId, images = [] }) {
  const [state, setState] = useState({ loading: false, estimate: null, error: "" });
  const [activeImage, setActiveImage] = useState(null);
  const resource = batchId ? `batches/${encodeURIComponent(batchId)}` : productId ? `products/${encodeURIComponent(productId)}` : "";

  useEffect(() => {
    let active = true;
    if (!resource) {
      setState({ loading: false, estimate: null, error: "" });
      return () => { active = false; };
    }
    setState({ loading: true, estimate: null, error: "" });
    get(`/${resource}/output-1/estimate`)
      .then((estimate) => active && setState({ loading: false, estimate, error: "" }))
      .catch((error) => active && setState({ loading: false, estimate: null, error: error.message }));
    return () => { active = false; };
  }, [resource]);

  useEffect(() => {
    if (!activeImage) return undefined;
    const close = (event) => event.key === "Escape" && setActiveImage(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", close); };
  }, [activeImage]);

  const comparison = state.estimate?.optimizationComparison;
  return <section className="input-optimization" aria-live="polite">
    <header className="input-optimization-heading"><span><ImageDown size={19} /></span><div><strong>تحسين صور الإدخال</strong><small>نحفظ الأصل، ونرسل النسخة المصغّرة فقط. لا قص، لا تمديد، ولا تغيير لنسبة الأبعاد.</small></div></header>
    {images.length > 0 && <div className="optimized-reference-grid">{images.map((image) => <button type="button" key={image.id || image.role} onClick={() => setActiveImage(image)} aria-label={`تكبير النسخة المحسنة لصورة ${roleLabel(image.role)}`}>
      <img src={mediaUrl(image.url)} alt={`النسخة المحسنة لصورة ${roleLabel(image.role)}`} />
      <span><b>{roleLabel(image.role)}</b><small dir="ltr">{dimensions(image.sourceWidth, image.sourceHeight)} → {dimensions(image.width, image.height)}</small></span><Maximize2 size={15} />
    </button>)}</div>}
    {state.loading ? <p className="generation-cost-loading"><LoaderCircle className="spin" size={18} />جارٍ حساب التكلفة فوراً بعد معالجة الصور…</p> : state.error ? <p className="generation-cost-error">تعذر حساب التكلفة: {state.error}</p> : comparison ? <>
      <div className="cost-comparison-grid"><CostCard title="قبل التصغير" value={comparison.before} /><CostCard title="بعد التصغير" value={comparison.after} optimized /></div>
      <p className="optimization-savings">خفض البكسلات <b>{decimal.format(comparison.pixelSavingsPercent)}%</b> · خفض حجم الملفات <b>{decimal.format(comparison.byteSavingsPercent)}%</b> · فرق التكلفة التقريبي <b dir="ltr">{usd.format(comparison.costSavingsUsd)}</b></p>
      <p className="generation-cost-detail">تقدير GPT يظهر تلقائياً بعد الرفع، بغض النظر عن المحرك المختار. وقد تتساوى التكلفة رغم انخفاض البكسلات عندما تقع الصورتان ضمن شريحة الرموز نفسها.</p>
    </> : null}
    {activeImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="معاينة الصورة بعد التصغير" onMouseDown={(event) => event.target === event.currentTarget && setActiveImage(null)}><div className="image-lightbox-dialog"><header><div><strong>الصورة بعد التصغير</strong><span dir="ltr">{dimensions(activeImage.width, activeImage.height)} · {formatBytes(activeImage.sizeBytes)}</span></div><button className="image-lightbox-close" type="button" onClick={() => setActiveImage(null)} aria-label="إغلاق المعاينة"><X size={22} /></button></header><div className="image-lightbox-stage"><img src={mediaUrl(activeImage.url)} alt={`معاينة ${roleLabel(activeImage.role)} بعد التصغير`} /></div><footer><span className="optimized-lightbox-note">اضغط للتكبير وراجع تفاصيل الإطار قبل بدء التوليد.</span></footer></div></div>}
  </section>;
}

function CostCard({ title, value, optimized = false }) {
  return <article className={`cost-comparison-card ${optimized ? "optimized" : ""}`}><span>{title}</span><strong dir="ltr">{usd.format(value.estimatedUsd || 0)}</strong><dl><div><dt>البكسلات</dt><dd>{decimal.format((value.inputPixels || 0) / 1_000_000)} MP</dd></div><div><dt>الحجم</dt><dd dir="ltr">{formatBytes(value.inputBytes)}</dd></div><div><dt>رموز الصور</dt><dd>{integer.format(value.imageInputTokens || 0)}</dd></div><div><dt>الحد الاحتياطي</dt><dd dir="ltr">{usd.format(value.safetyCeilingUsd || 0)}</dd></div></dl></article>;
}

function dimensions(width, height) { return `${integer.format(width || 0)}×${integer.format(height || 0)}`; }
function formatBytes(bytes = 0) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function roleLabel(role) { return ({ front: "الأمامية", side: "الجانبية", angle: "زاوية 45°", temple: "الذراع" })[role] || role || "المرجع"; }
function mediaUrl(source = "") { try { const parsed = new URL(source, window.location.origin); return parsed.pathname.startsWith("/uploads/") ? `${parsed.pathname}${parsed.search}` : source; } catch { return source; } }
