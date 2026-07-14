// Orchestrates Arabic CRM authentication and feature navigation.

import { useCallback, useEffect, useState } from "react";
import { ContactRound, LayoutDashboard, LoaderCircle, PackageSearch, Settings2, ShoppingBag } from "lucide-react";
import { crmApi } from "./crmApi.js";
import { CrmLogin } from "./CrmLogin.jsx";
import { CustomerList } from "./CustomerList.jsx";
import { SaleWorkspace } from "./SaleWorkspace.jsx";
import { SalesDashboard } from "./SalesDashboard.jsx";
import { CrmSettings } from "./CrmSettings.jsx";
import { InventoryWorkspace } from "./InventoryWorkspace.jsx";

const views = [
  ["customers", "العملاء", ContactRound],
  ["sales", "المبيعات", LayoutDashboard],
  ["new-sale", "بيع جديد", ShoppingBag],
  ["inventory", "المخزون", PackageSearch],
  ["settings", "الإعدادات والمزامنة", Settings2],
];

const viewPaths = { customers: "/crm", sales: "/crm/sales", "new-sale": "/crm/new-sale", inventory: "/crm/inventory", settings: "/crm/settings" };

export function CrmWorkspace({ inform, navigatePath }) {
  const [configured, setConfigured] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState(() => viewForPath(window.location.pathname));
  const [highlightSaleId, setHighlightSaleId] = useState("");
  const [editSaleId, setEditSaleId] = useState("");
  const inspect = useCallback(async () => {
    const status = await crmApi.status(); setConfigured(status.configured);
    if (status.configured) setSession(await crmApi.session().catch(() => null));
  }, []);
  useEffect(() => { inspect().catch((error) => { setConfigured(false); inform(error.message, "warning"); }); }, [inspect, inform]);
  useEffect(() => {
    const syncView = () => setView(viewForPath(window.location.pathname));
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);
  const openView = useCallback((nextView) => {
    const path = viewPaths[nextView] || "/crm";
    setView(nextView);
    if (navigatePath) navigatePath(path);
    else if (window.location.pathname !== path) window.history.pushState({}, "", path);
  }, [navigatePath]);
  const openEditSale = useCallback((saleId) => { setEditSaleId(saleId); openView("new-sale"); }, [openView]);
  const editLoaded = useCallback(() => setEditSaleId(""), []);
  if (configured === null) return <div className="crm-loading"><LoaderCircle className="spin" size={25} />جارٍ تجهيز إدارة العملاء…</div>;
  if (!session) return <CrmLogin configured={configured} onLogin={async (pin) => { const next = await crmApi.login(pin); setSession(next); window.dispatchEvent(new Event("crm-session-change")); }} />;
  return <section className="section-stack"><header className="page-title"><div><p className="eyebrow">إدارة العملاء</p><h1>علاقة أذكى مع كل عميل.</h1><p>ملف موحّد، بيانات تواصل منظمة، كشف بصري محمي، وتسجيل مبيعات المنتجات.</p></div><span className={`crm-role ${session.role}`}>{session.role === "superuser" ? "المشرف الأعلى" : "الموظفون"}</span></header>
    <nav className="crm-subnav" aria-label="أقسام إدارة العملاء">{views.map(([id, label, Icon]) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => openView(id)}><Icon size={17} />{label}</button>)}</nav>
    {view === "customers" && <CustomerList session={session} inform={inform} />}
    {view === "sales" && <SalesDashboard session={session} inform={inform} highlightSaleId={highlightSaleId}
      onNewSale={() => openView("new-sale")} onEditSale={openEditSale} />}
    {view === "new-sale" && <SaleWorkspace inform={inform} initialEditSaleId={editSaleId} onEditLoaded={editLoaded}
      onSaleSaved={(saleId) => { setHighlightSaleId(saleId); openView("sales"); }} />}
    {view === "inventory" && <InventoryWorkspace inform={inform} />}
    {view === "settings" && <CrmSettings session={session} inform={inform} onLogout={async () => { await crmApi.logout(); setSession(null); window.dispatchEvent(new Event("crm-session-change")); }} />}
  </section>;
}

function viewForPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return Object.entries(viewPaths).find(([, path]) => path === normalized)?.[0] || "customers";
}
