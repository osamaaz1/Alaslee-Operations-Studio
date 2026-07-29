import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Grip,
  ImagePlus,
  LoaderCircle,
  Move,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { get, post, postBlob, put } from "../../api.js";

const layerLabels = {
  brandLogo: "شعار النظارة",
  alasleeLogo: "شعار الأصلي",
  cta: "نص الطلب",
  payments: "سلة والدفع",
};
const layerHeights = { brandLogo: 12, alasleeLogo: 8, cta: 10, payments: 12 };

export function BrandOverlayEditor({
  items,
  isSuperuser = false,
  inform,
  onClose,
  onRendered,
}) {
  const [catalog, setCatalog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [brandId, setBrandId] = useState("");
  const [brandTone, setBrandTone] = useState("auto");
  const [alasleeVariant, setAlasleeVariant] = useState("golden");
  const [ctaText, setCtaText] = useState("Available now\nOrder it");
  const [brandSearch, setBrandSearch] = useState("");
  const [layout, setLayout] = useState(null);
  const [activeLayer, setActiveLayer] = useState("brandLogo");
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMeta, setPreviewMeta] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [unsavedLayout, setUnsavedLayout] = useState(false);
  const unsavedLayoutRef = useRef(false);
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const interactionRef = useRef(null);
  const previewUrlRef = useRef("");
  const previousFocusRef = useRef(null);

  const activeItem = items[activeIndex] || items[0];
  const selectedBrand = catalog?.brands.find((brand) => brand.id === brandId);
  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLocaleLowerCase();
    if (!query) return catalog?.brands || [];
    return (catalog?.brands || []).filter((brand) =>
      `${brand.name} ${brand.nameAr}`.toLocaleLowerCase().includes(query));
  }, [brandSearch, catalog]);

  const close = useCallback(() => {
    if (isSuperuser && unsavedLayoutRef.current && !window.confirm("لديك تعديلات غير محفوظة على توزيع الهوية. هل تريد الإغلاق؟")) return;
    onClose();
  }, [isSuperuser, onClose]);

  useEffect(() => {
    unsavedLayoutRef.current = unsavedLayout;
  }, [unsavedLayout]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      previousFocusRef.current?.focus?.();
    };
  }, [close]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([get("/brand-overlay/catalog"), get("/brand-overlay/settings")])
      .then(([nextCatalog, nextSettings]) => {
        if (cancelled) return;
        const initialBrand = nextCatalog.brands[0]?.id || "";
        setCatalog(nextCatalog);
        setSettings(nextSettings);
        setBrandId(initialBrand);
        setCtaText(nextCatalog.defaultCtaText);
        setLayout(effectiveLayout(nextSettings, initialBrand));
      })
      .catch((error) => inform(error.message, "warning"));
    return () => { cancelled = true; };
  }, [inform]);

  useEffect(() => {
    if (!catalog || !settings || !brandId) return;
    setLayout(effectiveLayout(settings, brandId));
    setBrandTone(settings.brandOverrides?.[brandId]?.defaultTone || "auto");
    unsavedLayoutRef.current = false;
    setUnsavedLayout(false);
  }, [brandId, catalog, settings]);

  const selectBrand = (nextBrandId) => {
    if (nextBrandId === brandId) return;
    if (isSuperuser && unsavedLayoutRef.current
      && !window.confirm("سيتم تجاهل تعديلات التوزيع غير المحفوظة عند تغيير الماركة. هل تريد المتابعة؟")) return;
    setBrandId(nextBrandId);
  };

  const requestPreview = useCallback(async () => {
    if (!activeItem?.image?.id || !brandId || !layout) return;
    setPreviewBusy(true);
    try {
      const response = await postBlob(
        isSuperuser ? "/brand-overlay/admin/preview" : "/brand-overlay/preview",
        {
          items: [itemPayload(activeItem)],
          brandId,
          brandTone,
          alasleeVariant,
          ctaText,
          ...(isSuperuser ? { layout } : {}),
        },
      );
      const nextUrl = URL.createObjectURL(response.blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      const { blob, ...meta } = response;
      setPreviewMeta(meta);
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setPreviewBusy(false);
    }
  }, [activeItem, alasleeVariant, brandId, brandTone, ctaText, inform, isSuperuser, layout]);

  useEffect(() => {
    if (!brandId || !layout || !activeItem) return undefined;
    const timer = window.setTimeout(requestPreview, 320);
    return () => window.clearTimeout(timer);
  }, [activeItem, alasleeVariant, brandId, brandTone, ctaText, layout, requestPreview]);

  const changeLayout = (layer, patch, dirty = true) => {
    setLayout((current) => ({
      ...current,
      [layer]: { ...current[layer], ...patch },
    }));
    if (dirty) {
      unsavedLayoutRef.current = true;
      setUnsavedLayout(true);
    }
  };

  const changeSupportingTone = (supportingTone) => {
    setLayout((current) => ({ ...current, supportingTone }));
    unsavedLayoutRef.current = true;
    setUnsavedLayout(true);
  };

  const startInteraction = (event, layer, kind) => {
    if (!isSuperuser || !layout) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(layer);
    interactionRef.current = {
      layer,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      initial: { ...layout[layer] },
      rect: stageRef.current?.getBoundingClientRect(),
    };
    const moveInteraction = (moveEvent) => {
      const interaction = interactionRef.current;
      if (!interaction?.rect?.width || !interaction.rect.height) return;
      const deltaX = ((moveEvent.clientX - interaction.startX) / interaction.rect.width) * 100;
      const deltaY = ((moveEvent.clientY - interaction.startY) / interaction.rect.height) * 100;
      if (interaction.kind === "resize") {
        changeLayout(interaction.layer, {
          widthPercent: clamp(interaction.initial.widthPercent + deltaX, 2, 80),
        });
      } else {
        changeLayout(interaction.layer, {
          xPercent: clamp(interaction.initial.xPercent + deltaX, 0, 100),
          yPercent: clamp(interaction.initial.yPercent + deltaY, 0, 100),
        });
      }
    };
    const endInteraction = () => {
      interactionRef.current = null;
      window.removeEventListener("pointermove", moveInteraction);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
    };
    window.addEventListener("pointermove", moveInteraction);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);
  };

  const nudgeLayer = (event, layer) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.25;
    const current = layout[layer];
    changeLayout(layer, {
      xPercent: clamp(current.xPercent + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), 0, 100),
      yPercent: clamp(current.yPercent + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), 0, 100),
    });
  };

  const saveSettings = async (scope) => {
    setSaveBusy(true);
    try {
      const payload = scope === "global"
        ? { scope, layout, brandId }
        : { scope, brandId, brandLogo: layout.brandLogo, defaultTone: brandTone };
      const nextSettings = await put("/brand-overlay/settings", payload);
      setSettings(nextSettings);
      setLayout(effectiveLayout(nextSettings, brandId));
      unsavedLayoutRef.current = false;
      setUnsavedLayout(false);
      inform(scope === "global" ? "تم حفظ توزيع الهوية العام." : "تم حفظ إعداد شعار هذه الماركة.");
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setSaveBusy(false);
    }
  };

  const resetBrand = async () => {
    setSaveBusy(true);
    try {
      const nextSettings = await put("/brand-overlay/settings", { scope: "reset-brand", brandId });
      setSettings(nextSettings);
      setLayout(effectiveLayout(nextSettings, brandId));
      unsavedLayoutRef.current = false;
      setUnsavedLayout(false);
      inform("تمت إعادة شعار الماركة إلى التوزيع العام.");
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setSaveBusy(false);
    }
  };

  const render = async () => {
    setRenderBusy(true);
    try {
      const result = await post("/brand-overlay/render", {
        items: items.map(itemPayload),
        brandId,
        brandTone,
        alasleeVariant,
        ctaText,
      });
      setOutputs(result.outputs || []);
      onRendered?.(result.outputs || []);
      inform(
        result.failed
          ? `تم تجهيز ${result.succeeded} من ${result.total} صور. راجع الصور التي تعذر حفظها.`
          : `تم تجهيز ${result.succeeded} ${result.succeeded === 1 ? "صورة" : "صور"} مع الحفاظ على الأبعاد الأصلية.`,
        result.failed ? "warning" : "success",
      );
    } catch (error) {
      inform(error.message, "warning");
    } finally {
      setRenderBusy(false);
    }
  };

  if (!catalog || !settings || !layout) {
    return <ModalShell dialogRef={dialogRef} onBackdrop={close}>
      <div className="brand-overlay-loading"><h2 id="brand-overlay-title" hidden>محرر الهوية</h2><LoaderCircle className="spin" size={28} /><strong>جارٍ تجهيز مكتبة الشعارات…</strong></div>
    </ModalShell>;
  }

  return <ModalShell dialogRef={dialogRef} onBackdrop={close}>
    <header className="brand-overlay-header">
      <div>
        <span className="brand-overlay-kicker"><Sparkles size={15} />خطوة اختيارية بعد التوليد</span>
        <h2 id="brand-overlay-title">إضافة الهوية إلى {items.length === 1 ? "الصورة" : `${items.length} صور`}</h2>
        <p>لن تتغير الصورة الأصلية؛ سيُحفظ ملف PNG جديد بنفس عدد البكسلات والنسبة.</p>
      </div>
      <button className="brand-overlay-close" type="button" onClick={close} aria-label="إغلاق محرر الهوية"><X size={22} /></button>
    </header>

    <div className="brand-overlay-body">
      <aside className="brand-overlay-controls" aria-label="خيارات الهوية">
        <section className="brand-overlay-control-section">
          <label className="brand-overlay-label" htmlFor="brand-overlay-search">ماركة النظارة</label>
          <div className="brand-overlay-search"><Search size={16} /><input id="brand-overlay-search" type="search" value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} placeholder="ابحث باسم الماركة…" /></div>
          <div className="brand-overlay-brand-list" role="listbox" aria-label="ماركات النظارات">
            {filteredBrands.map((brand) => <button
              key={brand.id}
              type="button"
              role="option"
              aria-selected={brandId === brand.id}
              className={brandId === brand.id ? "selected" : ""}
              onClick={() => selectBrand(brand.id)}
            >
              <span><img src={brand.assetUrl} alt="" loading="lazy" decoding="async" /></span>
              <strong>{brand.name}</strong>
              {brandId === brand.id ? <Check size={15} /> : null}
            </button>)}
          </div>
        </section>

        <fieldset className="brand-overlay-control-section">
          <legend>لون شعار {selectedBrand?.name || "النظارة"}</legend>
          <div className="brand-overlay-choice-row">
            {catalog.tones.map((tone) => <label className={brandTone === tone.id ? "selected" : ""} key={tone.id}>
              <input type="radio" name="brandTone" checked={brandTone === tone.id} onChange={() => setBrandTone(tone.id)} />
              {tone.label}
            </label>)}
          </div>
        </fieldset>

        <fieldset className="brand-overlay-control-section">
          <legend>لون شعار الأصلي</legend>
          <div className="alaslee-variant-grid">
            {catalog.alasleeVariants.map((variant) => <label className={`${alasleeVariant === variant.id ? "selected" : ""} ${variant.id}`} key={variant.id}>
              <input type="radio" name="alasleeVariant" checked={alasleeVariant === variant.id} onChange={() => setAlasleeVariant(variant.id)} />
              <img src={variant.assetUrl} alt="" />
              <span>{variant.label}</span>
              {alasleeVariant === variant.id ? <Check size={14} /> : null}
            </label>)}
          </div>
        </fieldset>

        <label className="brand-overlay-control-section brand-overlay-text-field">
          <span>نص الدعوة للطلب</span>
          <textarea value={ctaText} maxLength={80} rows={2} onChange={(event) => setCtaText(limitLines(event.target.value, 2))} />
          <small>{ctaText.length}/80 · سطران كحد أقصى</small>
        </label>

        {isSuperuser ? <AdminLayoutControls
          layout={layout}
          activeLayer={activeLayer}
          setActiveLayer={setActiveLayer}
          changeLayout={changeLayout}
          changeSupportingTone={changeSupportingTone}
          saveSettings={saveSettings}
          resetBrand={resetBrand}
          saveBusy={saveBusy}
          hasBrandOverride={Boolean(settings.brandOverrides?.[brandId])}
        /> : null}
      </aside>

      <main className="brand-overlay-preview-column">
        {items.length > 1 ? <div className="brand-overlay-thumbnails" aria-label="الصور المحددة">
          {items.map((item, index) => <button type="button" className={activeIndex === index ? "selected" : ""} key={`${item.image.productId}-${item.image.id}`} onClick={() => setActiveIndex(index)}>
            <img src={mediaUrl(item.image)} alt={`الصورة المحددة ${index + 1}`} />
            <span>{index + 1}</span>
          </button>)}
        </div> : null}
        <div className="brand-overlay-stage-shell">
          <div className="brand-overlay-stage-meta">
            <span>{previewMeta?.width || activeItem.image.width} × {previewMeta?.height || activeItem.image.height} px</span>
            <span>{previewMeta?.brandTone ? `الشعار ${toneLabel(previewMeta.brandTone)}` : "معاينة بالحجم الأصلي"}</span>
          </div>
          <div
            className={`brand-overlay-stage ${previewBusy ? "loading" : ""}`}
            ref={stageRef}
            style={{ aspectRatio: `${activeItem.image.width || 1}/${activeItem.image.height || 1}` }}
          >
            <img src={previewUrl || mediaUrl(activeItem.image)} alt="معاينة الصورة بعد إضافة الهوية" />
            {isSuperuser ? Object.keys(layerLabels).map((layer) => <button
              key={layer}
              type="button"
              className={`brand-overlay-layer-box ${activeLayer === layer ? "selected" : ""}`}
              style={{
                left: `${layout[layer].xPercent}%`,
                top: `${layout[layer].yPercent}%`,
                width: `${layout[layer].widthPercent}%`,
                height: `${layerHeights[layer]}%`,
              }}
              onPointerDown={(event) => startInteraction(event, layer, "move")}
              onKeyDown={(event) => nudgeLayer(event, layer)}
              onClick={() => setActiveLayer(layer)}
              aria-label={`تحريك ${layerLabels[layer]}`}
            >
              <span><Move size={13} />{layerLabels[layer]}</span>
              <i onPointerDown={(event) => startInteraction(event, layer, "resize")} aria-hidden="true"><Grip size={14} /></i>
            </button>) : null}
            {previewBusy ? <span className="brand-overlay-preview-busy" role="status" aria-live="polite"><LoaderCircle className="spin" size={22} />تحديث المعاينة</span> : null}
          </div>
          <p className="brand-overlay-preserve-note"><Check size={15} />لا قص، لا تمديد، ولا تغيير لنسبة الصورة أو دقتها.</p>
        </div>

        {outputs.length ? <section className="brand-overlay-results" aria-live="polite">
          <header><div><Check size={18} /><span><strong>النتيجة النهائية جاهزة</strong><small>{outputs.length} {outputs.length === 1 ? "صورة محفوظة" : "صور محفوظة"}</small></span></div></header>
          <div>{outputs.map((output, index) => <article key={output.id}>
            <img src={mediaUrl(output)} alt={`الصورة النهائية ${index + 1}`} />
            <span>{output.width} × {output.height}</span>
            <a className="button secondary" href={mediaUrl(output)} download={output.filename}><Download size={16} />تحميل</a>
          </article>)}</div>
        </section> : null}
      </main>
    </div>

    <footer className="brand-overlay-footer">
      <button className="button secondary" type="button" onClick={close}>إنهاء من دون إضافة</button>
      <div>
        <button className="button secondary" type="button" onClick={requestPreview} disabled={previewBusy}><ImagePlus size={17} />تحديث المعاينة</button>
        <button className="button primary" type="button" onClick={render} disabled={renderBusy || !brandId}>
          {renderBusy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
          {renderBusy ? "جارٍ حفظ الصور…" : `تطبيق الهوية على ${items.length === 1 ? "الصورة" : `${items.length} صور`}`}
        </button>
      </div>
    </footer>
  </ModalShell>;
}

function AdminLayoutControls({
  layout,
  activeLayer,
  setActiveLayer,
  changeLayout,
  changeSupportingTone,
  saveSettings,
  resetBrand,
  saveBusy,
  hasBrandOverride,
}) {
  const selected = layout[activeLayer];
  return <section className="brand-overlay-admin">
    <header><span><SlidersHorizontal size={16} />أدوات المسؤول</span><small>اسحب العنصر على المعاينة أو عدّل القيم</small></header>
    <div className="brand-overlay-layer-tabs">
      {Object.entries(layerLabels).map(([id, label]) => <button type="button" className={activeLayer === id ? "selected" : ""} onClick={() => setActiveLayer(id)} key={id}>{label}</button>)}
    </div>
    <div className="brand-overlay-sliders">
      <LayoutRange label="أفقي" value={selected.xPercent} min={0} max={100} onChange={(value) => changeLayout(activeLayer, { xPercent: value })} />
      <LayoutRange label="عمودي" value={selected.yPercent} min={0} max={100} onChange={(value) => changeLayout(activeLayer, { yPercent: value })} />
      <LayoutRange label="الحجم" value={selected.widthPercent} min={2} max={80} onChange={(value) => changeLayout(activeLayer, { widthPercent: value })} />
    </div>
    <label className="brand-overlay-support-tone">لون النص والدفع
      <select value={layout.supportingTone} onChange={(event) => changeSupportingTone(event.target.value)}>
        <option value="auto">تلقائي</option><option value="light">فاتح</option><option value="dark">داكن</option>
      </select>
    </label>
    <div className="brand-overlay-admin-actions">
      <button type="button" onClick={() => saveSettings("global")} disabled={saveBusy}><Save size={15} />حفظ كتوزيع عام</button>
      <button type="button" onClick={() => saveSettings("brand")} disabled={saveBusy}><Save size={15} />حفظ شعار الماركة</button>
      {hasBrandOverride ? <button type="button" onClick={resetBrand} disabled={saveBusy}><RotateCcw size={15} />إلغاء تخصيص الماركة</button> : null}
    </div>
  </section>;
}

function LayoutRange({ label, value, min, max, onChange }) {
  return <label><span>{label}<output>{Number(value).toFixed(2)}%</output></span><input type="range" min={min} max={max} step="0.25" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ModalShell({ dialogRef, onBackdrop, children }) {
  return <div className="brand-overlay-modal" onMouseDown={(event) => event.target === event.currentTarget && onBackdrop()}>
    <section className="brand-overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-overlay-title" tabIndex="-1" ref={dialogRef} onKeyDown={trapDialogFocus}>{children}</section>
  </div>;
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll(
    'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function effectiveLayout(settings, brandId) {
  const global = structuredClone(settings.globalLayout);
  const override = settings.brandOverrides?.[brandId];
  return {
    ...global,
    brandLogo: override?.brandLogo ? { ...override.brandLogo } : { ...global.brandLogo },
  };
}

function itemPayload(item) {
  return {
    productId: item.image.productId || item.productId,
    generatedImageId: Number(item.image.id),
  };
}

function mediaUrl(image) {
  const source = image?.url || image?.path || "";
  try {
    const parsed = new URL(source, window.location.origin);
    if (parsed.pathname.startsWith("/uploads/")) return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Retain non-URL values supplied by the server.
  }
  return source;
}

function toneLabel(tone) {
  return ({ original: "باللون الأصلي", light: "فاتح", dark: "داكن" })[tone] || tone;
}

function limitLines(value, maximumLines) {
  return value.replace(/\r\n?/g, "\n").split("\n").slice(0, maximumLines).join("\n");
}

function clamp(value, min, max) {
  return Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
}
