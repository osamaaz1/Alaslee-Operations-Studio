// Orchestrates Arabic CRM authentication and feature navigation.

import { useCallback, useEffect, useState } from "react";
import { ContactRound, LoaderCircle, PackageSearch, Settings2 } from "lucide-react";
import { crmApi } from "./crmApi.js";
import { CrmLogin } from "./CrmLogin.jsx";
import { CustomerList } from "./CustomerList.jsx";
import { CrmSettings } from "./CrmSettings.jsx";
import { InventoryWorkspace } from "./InventoryWorkspace.jsx";

const views = [
  ["customers", "العملاء", ContactRound],
  ["inventory", "المخزون", PackageSearch],
  ["settings", "الإعدادات والمزامنة", Settings2],
];

export function CrmWorkspace({ inform }) {
  const [configured, setConfigured] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("customers");
  const inspect = useCallback(async () => {
    const status = await crmApi.status(); setConfigured(status.configured);
    if (status.configured) setSession(await crmApi.session().catch(() => null));
  }, []);
  useEffect(() => { inspect().catch((error) => { setConfigured(false); inform(error.message, "warning"); }); }, [inspect, inform]);
  if (configured === null) return <div className="crm-loading"><LoaderCircle className="spin" size={25} />جارٍ تجهيز إدارة العملاء…</div>;
  if (!session) return <CrmLogin configured={configured} onLogin={async (pin) => { const next = await crmApi.login(pin); setSession(next); window.dispatchEvent(new Event("crm-session-change")); }} />;
  return <section className="section-stack"><header className="page-title"><div><p className="eyebrow">إدارة العملاء</p><h1>علاقة أذكى مع كل عميل.</h1><p>ملف موحّد، بيانات تواصل منظمة، وكشف بصري محمي.</p></div><span className={`crm-role ${session.role}`}>{session.role === "superuser" ? "المشرف الأعلى" : "الموظفون"}</span></header>
    <nav className="crm-subnav" aria-label="أقسام إدارة العملاء">{views.map(([id, label, Icon]) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}</nav>
    {view === "customers" && <CustomerList session={session} inform={inform} />}
    {view === "inventory" && <InventoryWorkspace inform={inform} />}
    {view === "settings" && <CrmSettings session={session} inform={inform} onLogout={async () => { await crmApi.logout(); setSession(null); window.dispatchEvent(new Event("crm-session-change")); }} />}
  </section>;
}
