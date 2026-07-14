import { useEffect, useRef } from "react";
import { Check, CircleAlert, Clock3, Image, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";

const roleLabels = { front: "الصورة الأمامية", side: "الصورة الجانبية", angle: "صورة زاوية 45°", model: "صورة الشخص بالنظارة" };

export function ProductGenerationProgress({ progress, busy, onRetry }) {
  if (!progress) return null;
  const failed = progress.roles?.some((role) => role.state === "failed");
  return <section className={`generation-progress ${busy ? "is-active" : "is-settled"}`} aria-live="polite" aria-busy={busy}>
    <ProgressHeader completed={progress.completedCount || 0} expected={progress.expectedCount || progress.roles?.length || 0} busy={busy} />
    <div className="generation-progress-grid">{progress.roles?.map((role, index) => <GenerationRoleCard role={role} index={index} key={role.role} />)}</div>
    {failed && !busy && <button className="button secondary retry-missing" type="button" onClick={onRetry}><RefreshCw size={16} />إعادة الصور الناقصة فقط</button>}
  </section>;
}

export function BatchGenerationProgress({ progress, busy, onRetry }) {
  if (!progress) return null;
  const summary = progress.summary || {};
  return <section className={`generation-progress batch-generation-progress ${busy ? "is-active" : "is-settled"}`} aria-live="polite" aria-busy={busy}>
    <ProgressHeader completed={summary.completedImages || 0} expected={summary.expectedImages || 0} busy={busy} batch />
    <div className="batch-progress-products">{progress.products?.map((product) => <article className={`batch-progress-product ${product.status}`} key={product.productId}><header><div><span>المنتج</span><strong dir="ltr">{product.productCode}</strong></div><small>{product.completedCount}/{product.expectedCount}</small></header><div className="generation-progress-grid compact">{product.roles.map((role, index) => <GenerationRoleCard role={role} index={index} compact key={role.role} />)}</div></article>)}</div>
    {Number(summary.failedProducts) > 0 && !busy && <button className="button secondary retry-missing" type="button" onClick={onRetry}><RefreshCw size={16} />إعادة الصور الناقصة في الدفعة</button>}
  </section>;
}

export function ProviderFallbackDialog({ open, gptAvailable, onConfirm, onClose }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    confirmRef.current?.focus();
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="provider-fallback-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="provider-fallback-dialog" role="dialog" aria-modal="true" aria-labelledby="provider-fallback-title"><button className="provider-fallback-close" type="button" onClick={onClose} aria-label="إغلاق"><X size={19} /></button><span className="provider-fallback-icon"><Sparkles size={26} /></span><h2 id="provider-fallback-title">Gemini مو جاهز على هذا الجهاز</h2>{gptAvailable ? <><p>ما لقينا مفتاح Gemini، لذلك ما نقدر نبدأ منه. تحب نبدّل إلى GPT ونكمل التوليد بنفس إعداداتك؟</p><div><button className="button secondary" type="button" onClick={onClose}>لا، رجوع</button><button ref={confirmRef} className="button primary" type="button" onClick={onConfirm}>نعم، حوّل إلى GPT</button></div></> : <><p>ما لقينا مفتاح Gemini، ومفتاح GPT غير موجود أيضاً. اطلب من المسؤول إضافة مفتاح صالح ثم جرّب مرة ثانية.</p><div><button ref={confirmRef} className="button primary" type="button" onClick={onClose}>حسناً</button></div></>}</section></div>;
}

function ProgressHeader({ completed, expected, busy, batch }) {
  return <header className="generation-progress-head"><span className="generation-orbit"><Sparkles size={20} /></span><div><strong>{busy ? batch ? "جاري توليد صور الدفعة" : "جاري تجهيز صور المنتج" : completed === expected ? "اكتمل التوليد" : "راجع الصور التي لم تكتمل"}</strong><small>{completed} من {expected} صور اكتملت</small></div><b>{expected ? Math.round((completed / expected) * 100) : 0}%</b></header>;
}

function GenerationRoleCard({ role, index, compact = false }) {
  const label = roleLabels[role.role] || role.role;
  return <article className={`generation-role-card ${role.state} ${compact ? "compact" : ""}`} style={{ "--delay": `${index * 90}ms` }}>
    <div className="generation-role-visual">{role.state === "completed" && role.image?.url ? <img src={role.image.url} alt={label} /> : role.state === "failed" ? <CircleAlert size={compact ? 18 : 27} /> : role.state === "generating" ? <><span className="generation-rings"></span><LoaderCircle className="spin" size={compact ? 19 : 29} /></> : <Image size={compact ? 18 : 27} />}</div>
    <div className="generation-role-copy"><strong>{label}</strong>{role.state === "completed" ? <small className="role-success"><Check size={13} />تم توليد الصورة{role.durationMs != null ? <> خلال <b>{formatDuration(role.durationMs)}</b></> : null}</small> : role.state === "generating" ? <small>جاري التوليد… نحافظ على أدق تفاصيل النظارة</small> : role.state === "failed" ? <small className="role-error">تعذر توليد هذه الصورة</small> : <small>بانتظار دورها</small>}</div>
    {role.state === "completed" && role.durationMs != null && <span className="role-time"><Clock3 size={12} />{formatDuration(role.durationMs)}</span>}
  </article>;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(1, Math.round(Number(milliseconds) / 1000));
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60); const rest = seconds % 60;
  return rest ? `${minutes} د ${rest} ث` : `${minutes} دقيقة`;
}
