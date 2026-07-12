// Shows the read-only Daftra inventory snapshot inside the protected CRM workspace.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronLeft, Eye, EyeOff, MapPin, PackageSearch, RefreshCw, Search, Tag } from "lucide-react";
import { crmApi } from "./crmApi.js";

const quantity = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 });

export function InventoryWorkspace({ inform }) {
  const [products, setProducts] = useState([]);
  const [sync, setSync] = useState(null);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextQuery = "") => {
    setLoading(true);
    try {
      const [productRows, syncStatus] = await Promise.all([crmApi.products(nextQuery), crmApi.syncStatus()]);
      setProducts(productRows); setSync(syncStatus);
    } catch (error) {
      inform(error.message, "warning"); setProducts([]);
    } finally { setLoading(false); }
  }, [inform]);

  useEffect(() => { load(); }, [load]);
  const selected = products.find((product) => product.external_id === selectedId) || null;
  const visibleProducts = useMemo(() => showOutOfStock ? products : products.filter((product) => !isOutOfStock(product)), [products, showOutOfStock]);
  const summary = useMemo(() => {
    const tracked = products.filter((product) => product.track_stock !== false);
    return {
      products: products.length,
      available: tracked.filter((product) => Number(product.stock_balance || 0) > 0).length,
      low: tracked.filter((product) => { const value = Number(product.stock_balance || 0); return value > 0 && value <= 3; }).length,
      unavailable: tracked.filter((product) => Number(product.stock_balance || 0) <= 0).length,
    };
  }, [products]);

  const search = (event) => {
    event.preventDefault();
    const next = query.trim(); setSearchedQuery(next); setSelectedId(""); load(next);
  };
  const toggleOutOfStock = () => {
    const next = !showOutOfStock;
    setShowOutOfStock(next);
    if (!next && selected && isOutOfStock(selected)) setSelectedId("");
  };

  return <section className="crm-stack inventory-workspace">
    <div className="inventory-hero panel"><div><p className="eyebrow">دفترة · قراءة فقط</p><h2>المخزون والمنتجات</h2><p>متابعة واضحة للكميات والأسعار وبيانات كل منتج من آخر مزامنة مع دفترة.</p></div><div className={`inventory-sync ${sync?.freshness === "fresh" ? "fresh" : ""}`}><i></i><span>آخر مزامنة</span><strong>{sync?.latest?.completed_at ? new Date(sync.latest.completed_at).toLocaleString("ar-SA-u-nu-latn") : "لا توجد مزامنة"}</strong></div></div>
    <section className="inventory-stats" aria-label="ملخص المخزون"><InventoryStat icon={Boxes} label="المنتجات المعروضة" value={quantity.format(summary.products)} /><InventoryStat icon={PackageSearch} label="متوفر" value={quantity.format(summary.available)} tone="available" /><InventoryStat icon={Tag} label="منخفض · حتى 3" value={quantity.format(summary.low)} tone="low" /><InventoryStat icon={MapPin} label="غير متوفر" value={quantity.format(summary.unavailable)} tone="out" /></section>
    <article className="panel inventory-table-panel"><header className="inventory-toolbar"><div><p className="eyebrow">لقطة المخزون</p><h2>قائمة المنتجات</h2></div><div className="inventory-toolbar-actions"><button type="button" className={`inventory-stock-toggle ${showOutOfStock ? "active" : ""}`} onClick={toggleOutOfStock} aria-pressed={showOutOfStock}>{showOutOfStock ? <EyeOff size={17} /> : <Eye size={17} />}<span>{showOutOfStock ? "إخفاء المنتهي" : `إظهار المنتهي (${quantity.format(summary.unavailable)})`}</span></button><form className="inventory-search" onSubmit={search}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالمنتج أو SKU أو الباركود" aria-label="البحث في منتجات المخزون" /><button type="submit" disabled={loading}>بحث</button><button type="button" className="inventory-reload" onClick={() => load(searchedQuery)} aria-label="تحديث عرض المخزون" disabled={loading}><RefreshCw size={17} /></button></form></div></header>
      <div className="crm-table-scroll"><table className="crm-table inventory-table"><thead><tr><th>المنتج</th><th>SKU / الباركود</th><th>الكمية المتاحة</th><th>المواقع</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan="5"><div className="inventory-loading">جارٍ تحميل لقطة المخزون من دفترة…</div></td></tr> : visibleProducts.length ? visibleProducts.map((product) => <InventoryRow key={product.external_id} product={product} selected={selectedId === product.external_id} onToggle={() => setSelectedId((id) => id === product.external_id ? "" : product.external_id)} />) : <tr><td colSpan="5"><div className="crm-empty"><PackageSearch size={30} /><strong>{products.length && !showOutOfStock ? "لا توجد منتجات متوفرة" : searchedQuery ? "لا توجد منتجات مطابقة" : "لا توجد منتجات متزامنة"}</strong><span>{products.length && !showOutOfStock ? "فعّل «إظهار المنتهي» لمراجعة المنتجات ذات المخزون الصفري." : searchedQuery ? "غيّر كلمة البحث وحاول مرة أخرى." : "أكمل إعداد دفترة أو نفّذ مزامنة من صفحة الإعدادات."}</span></div></td></tr>}</tbody></table></div>
    </article>
    {selected && <InventoryDetail product={selected} />}
  </section>;
}

function InventoryStat({ icon: Icon, label, value, tone = "default" }) { return <article className={`inventory-stat ${tone}`}><span><Icon size={19} /></span><div><small>{label}</small><strong dir="ltr">{value}</strong></div></article>; }
function InventoryRow({ product, selected, onToggle }) {
  const stock = stockState(product); const locations = Array.isArray(product.warehouses) ? product.warehouses.filter((item) => item.storeId) : [];
  return <tr className={selected ? "selected" : ""}><td><strong>{product.name}</strong><small>{[product.brand, product.category].filter(Boolean).join(" · ") || "بدون تصنيف"}</small></td><td><Identifiers product={product} compact /></td><td><span className={`stock-pill ${stock.tone}`} dir="ltr">{stock.label}</span></td><td><span className="warehouse-count"><MapPin size={14} />{quantity.format(locations.length)} مواقع</span></td><td><button type="button" className="row-action" onClick={onToggle} aria-expanded={selected}>تفاصيل<ChevronLeft size={15} /></button></td></tr>;
}
function InventoryDetail({ product }) {
  const locations = Array.isArray(product.warehouses) ? product.warehouses.filter((item) => item.storeId) : [];
  return <article className="panel inventory-detail"><header className="crm-panel-title"><div><p className="eyebrow">تفاصيل المنتج</p><h2>{product.name}</h2></div><span className={`stock-pill ${stockState(product).tone}`} dir="ltr">{stockState(product).label}</span></header><div className="inventory-detail-grid"><section><h3>معرّفات المنتج</h3><Identifiers product={product} /><dl><Detail label="العلامة" value={product.brand || "غير مسجلة"} /><Detail label="التصنيف" value={product.category || "غير مسجل"} /><Detail label="حالة المنتج" value={product.status || "غير معروفة"} /><Detail label="آخر تحديث" value={product.synced_at ? new Date(product.synced_at).toLocaleString("ar-SA-u-nu-latn") : "غير متاح"} /><Detail label="تتبع المخزون" value={product.track_stock === false ? "غير مفعّل" : "مفعّل"} /></dl></section><section><h3>توزيع المخزون حسب الموقع</h3>{locations.length ? <div className="warehouse-grid">{locations.map((location) => <article key={location.storeId} className="warehouse-card"><MapPin size={17} /><span>{location.storeName || "موقع غير مسمى"}</span><strong dir="ltr">{quantity.format(Number(location.quantity || 0))}</strong></article>)}</div> : <p className="empty-copy">لا توجد مواقع مخزون مسجلة لهذا المنتج.</p>}</section></div></article>;
}
function Identifiers({ product, compact = false }) { const values = [["SKU", product.sku || product.product_code], ["باركود", product.barcode]].filter(([, value]) => value); return <div className={compact ? "inventory-identifiers compact" : "inventory-identifiers"}>{values.length ? values.map(([label, value]) => <span key={label}><b>{label}</b><small dir="ltr">{value}</small></span>) : <small>غير مسجل</small>}</div>; }
function Detail({ label, value, ltr }) { return <div><dt>{label}</dt><dd dir={ltr ? "ltr" : undefined}>{value}</dd></div>; }
function stockState(product) { if (product.track_stock === false) return { tone: "untracked", label: "غير متتبع" }; const value = Number(product.stock_balance || 0); if (value <= 0) return { tone: "out", label: "0 · غير متوفر" }; if (value <= 3) return { tone: "low", label: `${quantity.format(value)} · منخفض` }; return { tone: "available", label: `${quantity.format(value)} · متوفر` }; }
function isOutOfStock(product) { return product.track_stock !== false && Number(product.stock_balance ?? 0) <= 0; }
