// Isolates all CRM, Daftra, scoring, and import requests from React views.

import { get, post, put, remove } from "../../api.js";

export const crmApi = {
  status: () => get("/auth/status"),
  session: () => get("/auth/session"),
  login: (pin) => post("/auth/pin", { pin }),
  logout: () => post("/auth/logout", {}),
  sources: () => get("/crm/customers/sources"),
  customers: (query = "") => get(`/crm/customers?q=${encodeURIComponent(query)}`),
  /** Download the customer register as a CSV or Excel workbook. */
  exportCustomers: async (format = "csv", query = "") => {
    const normalized = format === "xlsx" ? "xlsx" : "csv";
    const response = await fetch(`/v1/crm/customers/export?format=${normalized}&q=${encodeURIComponent(query)}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      let message = "تعذر تصدير بيانات العملاء.";
      try { const body = await response.json(); message = body?.errors?.[0]?.message || body?.error?.message || message; } catch { /* non-JSON error */ }
      throw new Error(message);
    }
    return response;
  },
  customer: (id) => get(`/crm/customers/${encodeURIComponent(id)}`),
  createCustomer: (payload) => post("/crm/customers", payload),
  updateCustomer: (id, payload) => put(`/crm/customers/${encodeURIComponent(id)}`, payload),
  deleteCustomer: (id) => remove(`/crm/customers/${encodeURIComponent(id)}`),
  importCustomers: (file) => post("/crm/imports/customers/file", (() => { const body = new FormData(); body.append("file", file); body.append("dryRun", "false"); return body; })(), false),
  restoreCustomer: (id) => post(`/crm/customers/${encodeURIComponent(id)}/restore`, {}),
  addPrescription: (id, payload) => post(`/crm/customers/${encodeURIComponent(id)}/prescriptions`, payload),
  products: (query = "", { availableOnly = false } = {}) => get(`/daftra/products?q=${encodeURIComponent(query)}&availableOnly=${availableOnly ? "1" : "0"}`),
  syncStatus: () => get("/daftra/sync/status"),
  syncNow: () => post("/daftra/sync", {}),
  sales: () => get("/crm/sales"),
  sale: (id) => get(`/crm/sales/${encodeURIComponent(id)}`),
  createSale: (payload) => post("/crm/sales", payload),
  correctSale: (id, payload) => post(`/crm/sales/${encodeURIComponent(id)}/corrections`, payload),
  rfmRules: () => get("/crm/rfm/rules"),
  updateRfmRules: (payload) => put("/crm/rfm/rules", payload),
  imports: () => get("/crm/imports"),
  importHistory: () => post("/crm/imports/history", {}),
  importCandidates: () => get("/crm/imports/candidates"),
  decideImportCandidate: (id, payload) => post(`/crm/imports/candidates/${encodeURIComponent(id)}/decision`, payload),
  vaultEntries: (query = "") => get(`/accounts?q=${encodeURIComponent(query)}`),
  vaultEntry: (id) => get(`/accounts/${encodeURIComponent(id)}`),
  createVaultEntry: (payload) => post("/accounts", payload),
  updateVaultEntry: (id, payload) => put(`/accounts/${encodeURIComponent(id)}`, payload),
  revealVaultSecret: (id) => post(`/accounts/${encodeURIComponent(id)}/reveal`, {}),
  deleteVaultEntry: (id) => remove(`/accounts/${encodeURIComponent(id)}`),
};
