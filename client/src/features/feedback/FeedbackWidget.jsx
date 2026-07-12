// Renders an accessible, movable global feedback panel backed by Supabase only.

import { useEffect, useRef, useState } from "react";
import { Bug, GripVertical, ImagePlus, Lightbulb, Send, TriangleAlert, X } from "lucide-react";
import { FEEDBACK_KINDS, FEEDBACK_PRIORITIES } from "../../../../shared/feedback/feedbackConstants.js";
import { feedbackApi } from "./feedbackApi.js";

const emptyForm = { kind: "bug", priority: "normal", title: "", description: "" };
const initialPosition = { right: 18, bottom: 82 };

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const panelRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    feedbackApi.status().then(setStatus).catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const dragStart = (event) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragMove = (event) => {
    const start = dragRef.current;
    if (!start) return;
    const rect = panelRef.current?.getBoundingClientRect();
    const maxRight = Math.max(8, window.innerWidth - (rect?.width || 360) - 8);
    const maxBottom = Math.max(8, window.innerHeight - (rect?.height || 560) - 8);
    setPosition({
      right: clamp(start.position.right - (event.clientX - start.x), 8, maxRight),
      bottom: clamp(start.position.bottom - (event.clientY - start.y), 8, maxBottom),
    });
  };
  const dragEnd = () => { dragRef.current = null; };
  const submit = async (event) => {
    event.preventDefault();
    if (!status?.configured) return setMessage({ type: "error", text: "ربط Supabase مطلوب لإرسال التقرير." });
    setSending(true);
    try {
      await feedbackApi.submit({ ...form, pagePath: `${window.location.pathname}${window.location.search}` }, image);
      setForm(emptyForm); setImage(null);
      setMessage({ type: "success", text: "وصل تقريرك بنجاح. شكرًا لمساعدتنا على التحسين." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSending(false);
    }
  };
  const style = { right: `${position.right}px`, bottom: `${position.bottom}px` };

  if (!open) return <button className="feedback-tab" type="button" style={style} onClick={() => setOpen(true)}><Bug size={18} />ملاحظات</button>;
  return <aside ref={panelRef} className="feedback-panel" style={style} aria-label="إرسال ملاحظة للنظام">
    <header className="feedback-panel-head">
      <div className="feedback-drag-handle" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} title="اسحب لتحريك اللوحة">
        <GripVertical size={18} aria-hidden="true" />
      </div>
      <div><strong>ملاحظاتك تهمنا</strong><span>بلّغ عن خطأ أو أرسل اقتراحًا</span></div>
      <button type="button" className="feedback-close" onClick={() => setOpen(false)} aria-label="إغلاق لوحة الملاحظات"><X size={19} /></button>
    </header>
    <div className={`feedback-readiness ${status?.configured ? "ready" : ""}`}>
      {status?.configured ? "Supabase جاهز لاستقبال التقارير بأمان." : "اربط Supabase أولاً لتفعيل إرسال التقارير."}
    </div>
    <form className="feedback-form" onSubmit={submit}>
      <div className="feedback-grid">
        <Field label="نوع الملاحظة"><select value={form.kind} onChange={(event) => set("kind", event.target.value)}>{FEEDBACK_KINDS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field>
        <Field label="مدى الأهمية"><select value={form.priority} onChange={(event) => set("priority", event.target.value)}>{FEEDBACK_PRIORITIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field>
      </div>
      <Field label="عنوان مختصر"><input value={form.title} onChange={(event) => set("title", event.target.value)} minLength="3" maxLength="160" required placeholder="مثال: خطأ يمنع حفظ العميل" /></Field>
      <Field label="التفاصيل"><textarea value={form.description} onChange={(event) => set("description", event.target.value)} minLength="10" maxLength="5000" required placeholder="ما الذي حدث؟ وما النتيجة التي توقعتها؟" /></Field>
      <label className="feedback-image"><ImagePlus size={18} /><span><strong>{image?.name || "إرفاق صورة · اختياري"}</strong><small>JPG أو PNG أو WEBP · حتى {maxImageMb(status)} MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
      {message && <p className={`feedback-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.type === "error" ? <TriangleAlert size={17} /> : <Lightbulb size={17} />}{message.text}</p>}
      <button className="button primary feedback-send" type="submit" disabled={sending || !status?.configured}><Send size={17} />{sending ? "جارٍ الإرسال…" : "إرسال الملاحظة"}</button>
    </form>
  </aside>;
}

function Field({ label, children }) {
  return <label className="feedback-field"><span>{label}</span>{children}</label>;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function maxImageMb(status) {
  return Math.round((status?.maxImageBytes || 6 * 1024 * 1024) / 1024 / 1024);
}
