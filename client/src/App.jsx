import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  Check,
  ChevronLeft,
  CloudCog,
  Download,
  FolderUp,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Store,
  Upload,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import { get, post, put } from "./api.js";
import { CrmWorkspace } from "./features/crm/CrmWorkspace.jsx";
import { AccountVault } from "./features/accounts/AccountVault.jsx";
import { FeedbackWidget } from "./features/feedback/FeedbackWidget.jsx";
import logoEyesUrl from "../../Logo Eyes.png";

const sections = [
  { id: "home", path: "/", label: "الرئيسية", icon: LayoutDashboard },
  { id: "production", path: "/products", label: "المنتجات والإنتاج", icon: Boxes },
  { id: "campaigns", path: "/campaigns", label: "الحملات", icon: Palette },
  { id: "crm", path: "/crm", label: "إدارة العملاء", icon: UsersRound },
  { id: "accounts", path: "/accounts", label: "الحسابات وكلمات المرور", icon: KeyRound },
  { id: "settings", path: "/settings", label: "التكاملات والإعدادات", icon: Settings2 },
];

const money = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 });

export default function App() {
  const [section, setSection] = useState(() => sectionForPath(window.location.pathname));
  const [workspace, setWorkspace] = useState(null);
  const [health, setHealth] = useState(null);
  const [salla, setSalla] = useState(null);
  const [branding, setBranding] = useState(null);
  const [product, setProduct] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);

  const inform = useCallback((message, type = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  }, []);

  const refreshOverview = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([get("/health"), get("/data/summary"), get("/salla/status"), get("/branding/assets")]);
    const values = results.map((result) => (result.status === "fulfilled" ? result.value : null));
    setHealth(values[0]);
    setWorkspace(values[1]);
    setSalla(values[2]);
    setBranding(values[3]);
    if (results.some((result) => result.status === "rejected")) inform("تم تحميل المتاح من مساحة العمل. راجع حالة الاتصال أدناه.", "warning");
    setLoading(false);
  }, [inform]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    const syncSectionWithUrl = () => setSection(sectionForPath(window.location.pathname));
    window.addEventListener("popstate", syncSectionWithUrl);
    return () => window.removeEventListener("popstate", syncSectionWithUrl);
  }, []);

  useEffect(() => {
    const syncSuperuser = () => get("/auth/session").then((session) => setIsSuperuser(session.role === "superuser")).catch(() => setIsSuperuser(false));
    syncSuperuser();
    window.addEventListener("crm-session-change", syncSuperuser);
    return () => window.removeEventListener("crm-session-change", syncSuperuser);
  }, []);

  const open = (id) => {
    const target = sections.find((item) => item.id === id);
    if (!target) return;
    if (window.location.pathname !== target.path) window.history.pushState({}, "", target.path);
    setSection(id);
    window.requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  };

  const content = useMemo(() => {
    const props = { workspace, health, salla, branding, product, setProduct, refreshOverview, inform, open };
    if (section === "production") return <Production {...props} />;
    if (section === "campaigns") return <Campaigns {...props} />;
    if (section === "crm") return <CrmWorkspace inform={inform} />;
    if (section === "accounts") return <AccountVault inform={inform} />;
    if (section === "settings") return <Settings {...props} />;
    return <Home {...props} />;
  }, [section, workspace, health, salla, branding, product, refreshOverview, inform]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">انتقل إلى المحتوى</a>
      <aside className="sidebar" aria-label="التنقل الرئيسي">
        <BrandSignature />
        <nav className="primary-nav">
          {sections.filter((item) => item.id !== "accounts" || isSuperuser).map(({ id, path, label, icon: Icon }) => (
            <a className={`nav-item ${section === id ? "is-active" : ""}`} key={id} href={path} aria-current={section === id ? "page" : undefined} onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); open(id);
            }}>
              <Icon aria-hidden="true" size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ConnectionBadge salla={salla} health={health} />
          <p>استوديو الأصلي<br />لعمليات المتجر</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>الأصلي</span><ChevronLeft size={16} aria-hidden="true" /><strong>{sections.find((item) => item.id === section)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="تحديث مساحة العمل" onClick={refreshOverview}><RefreshCw size={19} /></button>
            <button className="icon-button" type="button" aria-label="الإشعارات"><Bell size={19} /></button>
            <span className="operator-avatar" aria-label="المشغّل">أ</span>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex="-1">
          {loading ? <LoadingScreen /> : content}
        </main>
      </div>
      {notice && <div className={`toast ${notice.type}`} role="status"><span>{notice.type === "success" ? <Check size={18} /> : <CircleAlert size={18} />}</span>{notice.message}</div>}
      <FeedbackWidget />
    </div>
  );
}

function BrandSignature() {
  return <div className="brand-signature" aria-label="الأصلي">
    <span className="brand-logo-crop"><img className="brand-logo-image" src={logoEyesUrl} alt="شعار Original Eye" /></span>
    <span className="brand-words"><b>الأصلي</b><small>ALASLEE</small></span>
  </div>;
}

function sectionForPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return sections.find((item) => item.path === normalized)?.id || "home";
}

function ConnectionBadge({ salla, health }) {
  const online = salla?.connected || health?.ok;
  return <div className={`connection-badge ${online ? "ready" : "pending"}`}><i></i><span>{salla?.connected ? "سلة متصل" : health?.ok ? "الاستوديو جاهز" : "جارٍ التحقق"}</span></div>;
}

function Home({ workspace, health, salla, branding, open }) {
  const kpis = workspace?.kpis || {};
  const cards = [
    { label: "المنتجات", value: number.format(kpis.products || 0), icon: Boxes, hint: "جاهزة للتحليل والإنتاج", tone: "ink" },
    { label: "العملاء", value: number.format(kpis.clients || 0), icon: Store, hint: "سجل العملاء المتاح", tone: "soft" },
    { label: "عملاء بلا هاتف", value: number.format(workspace?.quality?.clientsWithoutPhone || 0), icon: UsersRound, hint: "تحتاج بيانات تواصل", tone: "alert" },
    { label: "سجلات عملاء مكررة", value: number.format(workspace?.quality?.duplicateClientNumbers || 0), icon: Search, hint: "تحتاج إلى مراجعة", tone: "gold" },
  ];
  return <>
    <section className="hero-card">
      <div className="hero-copy">
        <p className="eyebrow">مركز عمليات موحّد</p>
        <h1>كل ما يحتاجه متجرك،<br /><em>من رؤية واحدة.</em></h1>
        <p>تابع الأداء، جهّز منتجاتك، وأنشئ أصول الحملات المتوافقة مع هوية الأصلي من دون التنقل بين أدوات منفصلة.</p>
        <div className="hero-actions"><button type="button" className="button primary" onClick={() => open("production")}><Sparkles size={18} />ابدأ إنتاج منتج</button><button type="button" className="button quiet" onClick={() => open("crm")}>إدارة العملاء<ChevronLeft size={17} /></button></div>
      </div>
      <div className="hero-visual" aria-hidden="true"><div className="orbit one"></div><div className="orbit two"></div><div className="lens-card"><span>ALASLEE</span><b>01</b><i></i></div><div className="visual-chip left">البيانات</div><div className="visual-chip right">المنتج</div></div>
    </section>
    <section className="metric-grid" aria-label="ملخص الأعمال">{cards.map((card) => <MetricCard key={card.label} {...card} />)}</section>
    <section className="home-grid">
      <article className="panel workflow-panel"><PanelHeading kicker="خطوة تالية" title="سير عمل الإنتاج" action="كل المنتجات" onAction={() => open("production")} /><div className="workflow-list"><WorkflowRow number="01" title="أضف مرجع المنتج" text="صور أمامية وجانبية وزاوية 45°" active /><WorkflowRow number="02" title="أنشئ صور المتجر" text="مخرجات مدعومة بالذكاء الاصطناعي" /><WorkflowRow number="03" title="جهّز الحملة" text="صورة اجتماعية بهوية معتمدة" /></div></article>
      <article className="panel signal-panel"><PanelHeading kicker="حالة العمل" title="جاهزية الاستوديو" /><Readiness label="موفر الذكاء الاصطناعي" ready={Boolean(health?.ok)} value={health?.provider || "غير متاح"} /><Readiness label="حزمة العلامة التجارية" ready={Boolean(branding?.ready)} value={branding?.ready ? "جاهزة للإنتاج" : "تحتاج إلى أصول"} /><Readiness label="تكامل سلة" ready={Boolean(salla?.connected)} value={salla?.message || "قيد التحقق"} /></article>
    </section>
  </>;
}

function MetricCard({ label, value, icon: Icon, hint, tone }) { return <article className={`metric-card ${tone}`}><div className="metric-icon"><Icon size={21} /></div><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>; }
function WorkflowRow({ number, title, text, active }) { return <div className={`workflow-row ${active ? "active" : ""}`}><span>{number}</span><div><strong>{title}</strong><small>{text}</small></div><ChevronLeft size={18} /></div>; }
function Readiness({ label, ready, value }) { return <div className="readiness"><span>{label}</span><div><i className={ready ? "ready" : ""}></i><strong>{value}</strong></div></div>; }
function PanelHeading({ kicker, title, action, onAction }) { return <header className="panel-heading"><div><p className="eyebrow">{kicker}</p><h2>{title}</h2></div>{action && <button className="text-button" type="button" onClick={onAction}>{action}<ChevronLeft size={16} /></button>}</header>; }

function Production({ product, setProduct, inform, open }) {
  const [mode, setMode] = useState("single");
  const [provider, setProvider] = useState("gemini");
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState("");
  const [batchResult, setBatchResult] = useState(null);
  const [batchProducts, setBatchProducts] = useState([]);
  const submitUpload = async (event) => { event.preventDefault(); setBusy(true); try { const result = await post("/products/upload", new FormData(event.currentTarget), false); setProduct(result); inform("تم حفظ صور مرجع المنتج."); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const createOutput = async () => { if (!product?.id) return inform("أضف مرجع المنتج أولاً.", "warning"); setBusy(true); try { setProduct(await post("/products/generate", { productId: product.id, provider })); inform("اكتمل إنشاء صور المتجر."); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const importBatch = async (event) => { event.preventDefault(); setBusy(true); try { const result = await post("/batches/import-folder", { folderPath: folder, provider, brandingEnabled: false }); setBatchResult(result); setBatchProducts([]); inform(`تم استيراد ${result.products?.length || 0} منتج. راجع الدفعة ثم ابدأ التوليد.`); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const generateBatch = async () => {
    const batchId = batchResult?.batch?.id;
    if (!batchId) return inform("استورد مجلد الدفعة أولاً.", "warning");
    setBusy(true);
    try {
      const result = await post(`/batches/${encodeURIComponent(batchId)}/generate`, {});
      const details = await Promise.all((result.products || []).map((item) => get(`/products/${encodeURIComponent(item.id)}`)));
      setBatchResult(result);
      setBatchProducts(details);
      inform(result.results?.failed ? "اكتمل جزء من الدفعة. راجع المنتجات التي تعذر توليدها." : "اكتمل توليد صور الدفعة.", result.results?.failed ? "warning" : "success");
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setBusy(false);
    }
  };
  const images = product?.generatedImages || [];
  return <section className="section-stack"><PageTitle kicker="المنتجات والإنتاج" title="أنشئ أصولاً دقيقة للمنتج." text="ابدأ بمراجع واضحة، ثم راجع صور المتجر قبل نقل الأفضل إلى الحملة." action={<label className="provider-select">المحرك<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="gemini">Gemini</option><option value="gpt">GPT</option><option value="free-test">Try Free</option></select></label>} />
    <div className="production-layout"><article className="panel intake-panel"><div className="segmented" role="tablist"><button type="button" className={mode === "single" ? "selected" : ""} onClick={() => setMode("single")}>منتج واحد</button><button type="button" className={mode === "batch" ? "selected" : ""} onClick={() => setMode("batch")}>دفعة منتجات</button></div>{mode === "single" ? <form onSubmit={submitUpload}><PanelHeading kicker="01 — مراجع المنتج" title="أضف الصور الأصلية" /><p className="panel-copy">الصور الواضحة والمحايدة تحافظ على تفاصيل الإطار ولونه.</p><div className="upload-slots"><FileSlot name="front" label="الواجهة الأمامية" required /><FileSlot name="side" label="الجانب" required /><FileSlot name="angle" label="زاوية 45°" required /><FileSlot name="temple" label="تفاصيل الذراع" /></div><button className="button primary wide" type="submit" disabled={busy}><Upload size={18} />{busy ? "جارٍ الرفع…" : "حفظ مراجع المنتج"}</button></form> : <form className="batch-form" onSubmit={importBatch}><PanelHeading kicker="01 — إنتاج متسلسل" title="استيراد مجلد دفعة" /><p className="panel-copy">استخدم مجلداً منظماً بأسماء صور متكررة لكل منتج.</p><label className="field-label">مسار المجلد<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="E:\\Products\\Batch-01" required /></label><button className="button primary wide" type="submit" disabled={busy}><FolderUp size={18} />استيراد الدفعة</button></form>}</article>
      {mode === "single" ? <article className="panel output-panel"><PanelHeading kicker="02 — صور المتجر" title="معرض المنتج" action={product ? "تجهيز الحملة" : undefined} onAction={() => open("campaigns")} />{product ? <><div className="product-summary"><div><span>معرّف المنتج</span><strong dir="ltr">{product.id}</strong></div><div><span>الحالة</span><strong>{product.status || "جاهز"}</strong></div></div>{images.length ? <GeneratedImageGallery images={images} productId={product.id} inform={inform} /> : <EmptyState icon={ImagePlus} title="لم تُنشأ صور بعد" text="بعد حفظ المراجع، أنشئ أربع صور مهيأة لواجهة المتجر." /> }<button className="button primary wide" type="button" disabled={busy || provider === "free-test"} onClick={createOutput}><WandSparkles size={18} />{busy ? "جارٍ إنشاء الصور…" : "إنشاء صور المتجر"}</button></> : <EmptyState icon={ImagePlus} title="أضف منتجاً للبدء" text="ستظهر صور المتجر والنتائج هنا بعد رفع المراجع." />}</article> : <BatchOutputPanel batchResult={batchResult} products={batchProducts} busy={busy} onGenerate={generateBatch} inform={inform} />}</div>
  </section>;
}

function BatchOutputPanel({ batchResult, products, busy, onGenerate, inform }) {
  const batch = batchResult?.batch;
  const rows = batchResult?.products || [];
  const images = products.flatMap((product) => product.generatedImages || []);
  return <article className="panel output-panel batch-output-panel">
    <PanelHeading kicker="02 — صور الدفعة" title="نتائج المنتجات" />
    {batch ? <>
      <div className="product-summary batch-summary">
        <div><span>معرّف الدفعة</span><strong dir="ltr">{batch.id}</strong></div>
        <div><span>المنتجات</span><strong>{rows.length}</strong></div>
        <div><span>الحالة</span><strong>{batchStatusLabel(batch.status)}</strong></div>
      </div>
      {rows.length ? <div className="batch-product-list">{rows.map((item) => <div key={item.id} className={item.error_message ? "has-error" : ""}><span>{item.source_product_code || item.id}</span><strong>{batchStatusLabel(item.status)}</strong></div>)}</div> : null}
      {images.length ? <GeneratedImageGallery images={images} productId={batch.id} inform={inform} /> : <EmptyState icon={ImagePlus} title="الدفعة جاهزة للتوليد" text="ابدأ التوليد، وستظهر جميع صور منتجات المجلد هنا مع العرض الكبير والتحميل." />}
      <button className="button primary wide" type="button" disabled={busy} onClick={onGenerate}><WandSparkles size={18} />{busy ? "جارٍ توليد صور الدفعة…" : images.length ? "إعادة توليد الدفعة" : "توليد صور الدفعة"}</button>
    </> : <EmptyState icon={FolderUp} title="استورد مجلد المنتجات" text="بعد الاستيراد ستظهر تفاصيل الدفعة هنا، ويمكنك تشغيل التوليد ومراجعة كل الصور." />}
  </article>;
}

function batchStatusLabel(status) {
  return ({ imported: "تم الاستيراد", queued: "بانتظار التوليد", generating: "جارٍ التوليد", generated: "مكتملة", completed: "مكتملة", partial: "مكتملة جزئياً", failed: "تعذر التوليد" })[status] || status || "جاهزة";
}

function GeneratedImageGallery({ images, productId, inform }) {
  const [activeImage, setActiveImage] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    if (!activeImage) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => event.key === "Escape" && setActiveImage(null);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeImage]);

  const downloadOne = async (image, index) => {
    try {
      await downloadGeneratedImage(image, productId, index);
    } catch {
      inform("تعذر تحميل الصورة. تأكد من أن ملف الصورة ما زال متاحاً.", "warning");
    }
  };

  const downloadAll = async () => {
    setDownloadingAll(true);
    let failed = 0;
    for (let index = 0; index < images.length; index += 1) {
      try {
        await downloadGeneratedImage(images[index], productId, index);
      } catch {
        failed += 1;
      }
    }
    setDownloadingAll(false);
    inform(failed ? `تم تحميل ${images.length - failed} من ${images.length} صور.` : "تم تحميل جميع الصور المولدة.", failed ? "warning" : "success");
  };

  return <>
    <div className="generated-gallery-toolbar">
      <span>اضغط على أي صورة لعرضها بالحجم الكبير.</span>
      <button className="button secondary" type="button" onClick={downloadAll} disabled={downloadingAll}>
        <Download size={17} />{downloadingAll ? "جارٍ تحميل الصور…" : "تحميل جميع الصور"}
      </button>
    </div>
    <div className="image-grid">
      {images.map((image, index) => <article className="generated-image-card" key={image.id || image.role || index}>
        <button className="generated-image-open" type="button" onClick={() => setActiveImage({ image, index })} aria-label={`عرض صورة ${image.role || index + 1} بالحجم الكبير`}>
          <img src={mediaUrl(image)} alt={`صورة ${image.role || "منتج"}`} loading="lazy" />
          <span><Maximize2 size={16} />عرض كبير</span>
        </button>
        <button className="generated-image-download" type="button" onClick={() => downloadOne(image, index)}>
          <Download size={15} />تحميل الصورة
        </button>
      </article>)}
    </div>
    {activeImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="عرض الصورة المولدة" onMouseDown={(event) => event.target === event.currentTarget && setActiveImage(null)}>
      <div className="image-lightbox-dialog">
        <header>
          <div><strong>الصورة المولدة</strong><span>{activeImage.image.role || `الصورة ${activeImage.index + 1}`}</span></div>
          <button className="image-lightbox-close" type="button" onClick={() => setActiveImage(null)} aria-label="إغلاق العرض"><X size={22} /></button>
        </header>
        <div className="image-lightbox-stage"><img src={mediaUrl(activeImage.image)} alt={`صورة ${activeImage.image.role || "منتج"} بالحجم الكبير`} /></div>
        <footer><button className="button primary" type="button" onClick={() => downloadOne(activeImage.image, activeImage.index)}><Download size={17} />تحميل الصورة</button></footer>
      </div>
    </div>}
  </>;
}

function mediaUrl(image) {
  const source = image?.url || image?.path || "";
  try {
    const parsed = new URL(source, window.location.origin);
    if (parsed.pathname.startsWith("/uploads/")) return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Keep the server-provided source if it is not a URL.
  }
  return source;
}

async function downloadGeneratedImage(image, productId, index) {
  const response = await fetch(mediaUrl(image), { credentials: "same-origin" });
  if (!response.ok) throw new Error("Image download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const extension = image?.filename?.split(".").pop() || blob.type.split("/").pop() || "png";
  const safeProductId = String(productId || "product").replace(/[^a-zA-Z0-9_-]/g, "-");
  const originalFilename = image?.filename || `${index + 1}.${extension}`;
  const filename = `${safeProductId}-${String(image?.productCode || "").replace(/[^a-zA-Z0-9_-]/g, "-")}${image?.productCode ? "-" : ""}${originalFilename}`;
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function FileSlot({ name, label, required }) {
  const [selection, setSelection] = useState(null);
  useEffect(() => () => selection?.url && URL.revokeObjectURL(selection.url), [selection]);
  const selectFile = (event) => {
    const file = event.target.files?.[0];
    setSelection((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return file ? { name: file.name, url: URL.createObjectURL(file) } : null;
    });
  };
  return <label className={`file-slot ${selection ? "has-file" : ""}`}>
    <input type="file" name={name} accept="image/jpeg,image/png,image/webp" required={required} onChange={selectFile} />
    {selection ? <><img className="file-slot-preview" src={selection.url} alt={`معاينة ${label}`} /><span className="file-slot-status"><Check size={15} />تم الرفع</span><span className="file-slot-name" dir="ltr">{selection.name}</span></> : <><span className="file-slot-icon"><Plus size={18} /></span><strong>{label}</strong><small>{required ? "مطلوب" : "اختياري"}</small></>}
  </label>;
}

function Campaigns({ branding, refreshOverview, inform, product, setProduct }) {
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState("portrait-4x5");
  const [selectedImageId, setSelectedImageId] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const saveAssets = async (event) => { event.preventDefault(); setBusy(true); try { await post("/branding/assets", new FormData(event.currentTarget), false); await refreshOverview(); inform("تم حفظ أصول العلامة التجارية."); event.currentTarget.reset(); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const directUpload = async (event) => { event.preventDefault(); setBusy(true); try { const nextProduct = await post("/instagram/uploads", new FormData(event.currentTarget), false); setProduct(nextProduct); setSelectedImageId(""); inform("أُضيفت الصور الجاهزة إلى اختيار الحملة."); event.currentTarget.reset(); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const createCampaign = async (event) => { event.preventDefault(); const image = product?.generatedImages?.find((item) => String(item.id) === selectedImageId); if (!product?.id || !image?.id) return inform("اختر صورة منتج واحدة لإعدادها.", "warning"); setBusy(true); try { const result = await post("/instagram/generate", { profileId: profile, items: [{ productId: product.id, generatedImageId: image.id }], products: { [product.id]: { price, sku } } }); const nextProduct = await get(`/products/${encodeURIComponent(product.id)}`); setProduct(nextProduct); inform(result.failed ? "اكتمل جزء من الطلب. راجع حالة المخرج." : "اكتمل إعداد الصورة للحملة."); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const generatedImages = product?.generatedImages || [];
  const selectedImage = generatedImages.find((item) => String(item.id) === selectedImageId);
  return <section className="section-stack"><PageTitle kicker="الحملات" title="اجعل كل منشور يحمل بصمة الأصلي." text="ثبّت أصول الحملة ثم انقل الصورة المختارة من مخرجات المنتج لإعدادها للنشر." />
    <div className="campaign-layout"><article className="panel brand-kit"><PanelHeading kicker="01 — أصول الحملة" title="حزمة العلامة التجارية" /><p className="panel-copy">تُحفظ الأصول محلياً وتُفحص قبل كل عملية إنتاج.</p><form onSubmit={saveAssets} className="asset-form"><AssetField name="background" title="خلفية الحملة" meta="مطلوب · 1080 × 1350 موصى به" /><AssetField name="logo" title="شعار الزاوية" meta="مطلوب · PNG شفاف موصى به" /><AssetField name="footer" title="تذييل الحملة" meta="مطلوب" /><AssetField name="priceLabelReference" title="مرجع بطاقة السعر" meta="مطلوب للصورة النهائية" /><button className="button primary wide" type="submit" disabled={busy}><Palette size={18} />{busy ? "جارٍ الحفظ…" : "حفظ أصول الحملة"}</button></form><div className="direct-upload"><span>أو استخدم صوراً جاهزة للحملة</span><form onSubmit={directUpload}><label className="button secondary"><Upload size={16} />رفع صور جاهزة<input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" /></label><button type="submit" className="text-button" disabled={busy}>إضافة</button></form></div></article>
      <article className="panel campaign-prep"><PanelHeading kicker="02 — إعداد المنشور" title="المخرج الاجتماعي" /><div className="profile-tabs">{[["portrait-4x5", "منشور 4:5"], ["square-1x1", "مربع 1:1"], ["story-9x16", "قصة 9:16"]].map(([id, label]) => <button key={id} type="button" className={profile === id ? "active" : ""} onClick={() => setProfile(id)}>{label}</button>)}</div><div className={`campaign-canvas ${profile}`}><div className="canvas-grid"></div><span className="canvas-logo">الأصلي</span><div className="canvas-product">{selectedImage?.url || selectedImage?.path ? <img src={selectedImage.url || selectedImage.path} alt="الصورة المختارة للحملة" /> : <><ImagePlus size={38} /><small>{product ? "اختر صورة من المعرض" : "ارفع منتجاً أولاً"}</small></>}</div><span className="canvas-price">{price || "SAR —"}</span></div><form className="campaign-controls" onSubmit={createCampaign}>{generatedImages.length ? <div className="campaign-source-grid">{generatedImages.map((image) => <button key={image.id || image.role} type="button" className={String(image.id) === selectedImageId ? "selected" : ""} onClick={() => setSelectedImageId(String(image.id))}><img src={image.url || image.path} alt={`اختيار صورة ${image.role}`} /><span>{image.role}</span></button>)}</div> : <p className="empty-copy">لا توجد صور مصدر بعد. أنشئ صور المتجر أو ارفع صوراً جاهزة.</p>}<div className="metadata-grid"><label>السعر<input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="129 SAR" required /></label><label>SKU<input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="SKU-001" required dir="ltr" /></label></div><button className="button primary wide" type="submit" disabled={busy || !branding?.ready || !selectedImageId}><WandSparkles size={18} />{busy ? "جارٍ إعداد الصورة…" : "إنشاء مخرج الحملة"}</button></form><div className="campaign-note"><i className={branding?.ready ? "ready" : ""}></i><span>{branding?.ready ? "اختر صورة وأدخل السعر وSKU؛ يُستخدم SKU في السجل فقط." : "أضف أصول العلامة أولاً لتفعيل الإنشاء النهائي."}</span></div></article></div>
  </section>;
}

function AssetField({ name, title, meta }) { return <label className="asset-field"><input type="file" name={name} accept="image/jpeg,image/png,image/webp" /><span className="asset-icon"><ImagePlus size={19} /></span><span><strong>{title}</strong><small>{meta}</small></span><Upload size={17} /></label>; }

function DataWorkspace({ workspace, refreshOverview, inform }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState([]);
  const [busy, setBusy] = useState(false);
  const runSearch = async (event) => { event.preventDefault(); setBusy(true); try { const result = await get(`/data/summary?q=${encodeURIComponent(query)}`); setSearch(result.search || []); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  const sales = workspace?.monthlySales || [];
  const maxSale = Math.max(...sales.map((item) => item.revenue), 1);
  return <section className="section-stack"><PageTitle kicker="البيانات" title="رؤية أوضح لقرارات أسرع." text="ملخص موحّد لمبيعات المتجر، المنتجات، العملاء، وإشارات جودة البيانات." action={<button className="button secondary" type="button" onClick={refreshOverview}><RefreshCw size={17} />تحديث البيانات</button>} />
    <section className="data-kpis"><DataKpi label="المبيعات" value={money.format(workspace?.kpis?.revenue || 0)} /><DataKpi label="المدفوع" value={money.format(workspace?.kpis?.paid || 0)} /><DataKpi label="الفواتير" value={number.format(workspace?.kpis?.invoices || 0)} /><DataKpi label="الوحدات المباعة" value={number.format(workspace?.kpis?.units || 0)} /></section>
    <div className="data-layout"><article className="panel chart-panel"><PanelHeading kicker="الاتجاه الشهري" title="المبيعات خلال 12 شهراً" /><div className="bar-chart" role="img" aria-label="رسم أعمدة للمبيعات الشهرية">{sales.map((sale) => <div className="bar-column" key={sale.month}><span style={{ height: `${Math.max(6, sale.revenue / maxSale * 100)}%` }} title={money.format(sale.revenue)}></span><small>{sale.month.slice(5)}</small></div>)}</div></article><article className="panel quality-panel"><PanelHeading kicker="جودة البيانات" title="إشارات تحتاج مراجعة" /><QualityRow label="فواتير غير مسددة" value={workspace?.quality?.unpaidInvoices || 0} /><QualityRow label="عملاء بلا رقم هاتف" value={workspace?.quality?.clientsWithoutPhone || 0} /><QualityRow label="منتجات بلا سعر" value={workspace?.quality?.productsWithoutPrice || 0} /><QualityRow label="أرقام عملاء مكررة" value={workspace?.quality?.duplicateClientNumbers || 0} /></article></div>
    <div className="data-layout bottom"><article className="panel table-panel"><PanelHeading kicker="أفضل المنتجات" title="الأعلى مبيعاً" /><SimpleTable rows={workspace?.topProducts || []} columns={["name", "revenue", "quantity"]} labels={["المنتج", "المبيعات", "الكمية"]} /></article><article className="panel search-panel"><PanelHeading kicker="بحث موحّد" title="ابحث في بيانات المتجر" /><form className="search-form" onSubmit={runSearch}><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="عميل، فاتورة، منتج…" /></label><button type="submit" className="button primary" disabled={busy}>{busy ? "جارٍ البحث" : "بحث"}</button></form>{search.length ? <div className="search-results">{search.map((item, index) => <div key={`${item.type}-${index}`}><span>{item.type}</span><strong>{item.title}</strong><small>{item.meta}</small></div>)}</div> : <p className="empty-copy">اكتب كلمة للبحث في العملاء والفواتير والمنتجات.</p>}</article></div>
  </section>;
}

function DataKpi({ label, value }) { return <article className="data-kpi"><span>{label}</span><strong>{value}</strong></article>; }
function QualityRow({ label, value }) { return <div className="quality-row"><span><i className={value ? "attention" : "ready"}></i>{label}</span><strong>{number.format(value)}</strong></div>; }
function SimpleTable({ rows, columns, labels }) { return <div className="table-wrap"><table><thead><tr>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.length ? rows.slice(0, 6).map((row, index) => <tr key={row.id || index}>{columns.map((column) => <td key={column}>{column === "revenue" ? money.format(row[column] || 0) : row[column] || "—"}</td>)}</tr>) : <tr><td colSpan={labels.length}>لا توجد بيانات للعرض.</td></tr>}</tbody></table></div>; }

function Settings({ health, salla, branding, inform }) {
  const [prompts, setPrompts] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadPrompts = async () => { setBusy(true); try { setPrompts(await get("/prompts")); } catch (error) { inform(error.message, "warning"); } finally { setBusy(false); } };
  return <section className="section-stack"><PageTitle kicker="التكاملات والإعدادات" title="تحكم واضح، من دون تعقيد." text="راجع اتصال الخدمات، أصول العلامة، ومراحل الذكاء الاصطناعي من مساحة تشغيل واحدة." />
    <section className="integration-grid"><IntegrationCard icon={Sparkles} title="الذكاء الاصطناعي" status={health?.ok} value={health?.provider || "غير متاح"} detail="محرك صور المنتج والحملات" /><IntegrationCard icon={Store} title="سلة" status={salla?.connected} value={salla?.message || "غير متصل"} detail="فحص إعداد التكامل والرمز" /><IntegrationCard icon={Palette} title="هوية العلامة" status={branding?.ready} value={branding?.ready ? "جاهزة" : "تحتاج إعداداً"} detail="الخلفية والشعار والتذييل" /></section>
    <div className="settings-grid"><article className="panel prompt-panel"><PanelHeading kicker="مراحل الذكاء الاصطناعي" title="تعليمات الإنتاج" action={prompts ? "إخفاء" : "عرض التعليمات"} onAction={() => prompts ? setPrompts(null) : loadPrompts()} />{prompts ? <div className="prompt-list">{prompts.map((prompt) => <div key={prompt.id || prompt.stage}><strong>{prompt.label || prompt.stage}</strong><p>{prompt.prompt || prompt.text}</p></div>)}</div> : <div className="settings-empty"><CloudCog size={30} /><p>التعليمات محفوظة على الخادم ويمكن مراجعتها قبل الإنتاج.</p><button className="button secondary" type="button" onClick={loadPrompts} disabled={busy}>عرض التعليمات</button></div>}</article><article className="panel migration-panel"><PanelHeading kicker="ترحيل آمن" title="استيراد بيانات V1" /><p>ينقل الأمر المحلي قاعدة البيانات والأصول وملفات التحليل من دون نسخ أي مفاتيح أو أسرار.</p><code>npm run import:v1 -- --source &lt;path&gt; --dry-run</code><p className="code-note">استخدم <b>--apply</b> بعد مراجعة الملخص. الاستيراد يحفظ سجلّاً ويمنع التكرار.</p></article></div>
  </section>;
}

function IntegrationCard({ icon: Icon, title, status, value, detail }) { return <article className="integration-card"><div className="integration-icon"><Icon size={22} /></div><span>{title}</span><strong>{value}</strong><small><i className={status ? "ready" : ""}></i>{detail}</small></article>; }
function PageTitle({ kicker, title, text, action }) { return <header className="page-title"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{text}</p></div>{action && <div className="page-action">{action}</div>}</header>; }
function EmptyState({ icon: Icon, title, text }) { return <div className="empty-state"><span><Icon size={28} /></span><strong>{title}</strong><p>{text}</p></div>; }
function LoadingScreen() { return <div className="loading-screen"><LoaderCircle className="spin" size={30} /><strong>جارٍ تجهيز الاستوديو…</strong><span>نتحقق من البيانات والأصول والتكاملات.</span></div>; }
