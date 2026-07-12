// Reads OriginalEye analytics exports and renders safe preset dashboard widgets.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const dataRoot = config.dataWorkspaceDir || path.join(config.rootDir, "OriginalEye-Data-Analysis");
const maxWidgetLimit = 500;

const datasets = Object.freeze([
  { key: "invoices", label: "Invoices", file: "Invoices.csv", required: true },
  { key: "invoiceItems", label: "Invoice Items", file: "Invoice_items.csv", required: true },
  { key: "clients", label: "Clients", file: "Clients.csv", required: true },
  { key: "products", label: "Products", file: "Products.csv", required: true },
  { key: "clientContacts", label: "Client Contacts", file: "Client_contacts.csv", required: false },
]);

const presetDefinitions = Object.freeze([
  { id: "kpi.revenue", type: "kpi", title: "Revenue", view: "card", size: "small" },
  { id: "kpi.paid", type: "kpi", title: "Paid amount", view: "card", size: "small" },
  { id: "kpi.unpaid", type: "kpi", title: "Unpaid amount", view: "card", size: "small" },
  { id: "kpi.invoices", type: "kpi", title: "Invoices", view: "card", size: "small" },
  { id: "kpi.clients", type: "kpi", title: "Clients", view: "card", size: "small" },
  { id: "kpi.products", type: "kpi", title: "Products", view: "card", size: "small" },
  { id: "kpi.units", type: "kpi", title: "Units sold", view: "card", size: "small" },
  { id: "kpi.averageInvoice", type: "kpi", title: "Average invoice", view: "card", size: "small" },
  { id: "time.monthlyRevenue", type: "time", title: "Monthly revenue", view: "bar", size: "wide", limit: 12 },
  { id: "time.monthlyInvoices", type: "time", title: "Monthly invoice count", view: "bar", size: "wide", limit: 12 },
  { id: "ranking.topCustomersRevenue", type: "ranking", title: "Top customers by revenue", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "ranking.topCustomersQuantity", type: "ranking", title: "Top customers by items bought", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "ranking.topProductsRevenue", type: "ranking", title: "Top products by revenue", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "ranking.topProductsQuantity", type: "ranking", title: "Top products by quantity", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "ranking.topCitiesRevenue", type: "ranking", title: "Top cities by revenue", view: "table", size: "medium", limit: 50, pageSize: 10 },
  { id: "ranking.unpaidCustomers", type: "ranking", title: "Customers with unpaid amount", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "table.recentInvoices", type: "table", title: "Recent invoices", view: "table", size: "medium", limit: 50, pageSize: 10 },
  { id: "table.unpaidInvoices", type: "table", title: "Unpaid invoices", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "table.productList", type: "table", title: "Product list", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "table.clientList", type: "table", title: "Client list", view: "table", size: "medium", limit: 100, pageSize: 10 },
  { id: "quality.dataQuality", type: "quality", title: "Data quality signals", view: "list", size: "medium" },
  { id: "sources.dataSources", type: "sources", title: "Data sources", view: "list", size: "medium" },
]);

export const defaultDashboardLayout = Object.freeze({
  version: 1,
  widgets: Object.freeze([
    widget("kpi.revenue", "Revenue"),
    widget("kpi.invoices", "Invoices"),
    widget("kpi.clients", "Clients"),
    widget("kpi.products", "Products"),
    widget("time.monthlyRevenue", "Monthly sales", { size: "wide" }),
    widget("ranking.topProductsRevenue", "Best products", { limit: 100, pageSize: 8 }),
    widget("ranking.topCustomersRevenue", "Best customers", { limit: 100, pageSize: 8 }),
    widget("table.recentInvoices", "Recent invoices", { limit: 50, pageSize: 8 }),
    widget("sources.dataSources", "Data sources"),
  ]),
});

function widget(preset, title, overrides = {}) {
  const definition = presetDefinition(preset);
  return {
    id: `${preset.replace(/[^a-zA-Z0-9]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
    type: definition.type,
    preset,
    title,
    view: definition.view,
    size: definition.size,
    limit: definition.limit || 12,
    pageSize: definition.pageSize || definition.limit || 12,
    ...overrides,
  };
}

export function getWidgetCatalog() {
  return {
    datasets: datasets.map(({ key, label, required }) => ({ key, label, required })),
    sizes: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "wide", label: "Wide" },
    ],
    views: [
      { value: "card", label: "KPI card" },
      { value: "table", label: "Table" },
      { value: "bar", label: "Bar chart" },
      { value: "list", label: "Signal list" },
    ],
    presets: presetDefinitions.map((item) => ({ ...item })),
  };
}

export async function getDataWorkspaceSummary(input = {}) {
  const model = await loadDataModel();

  return {
    root: dataRoot,
    generatedAt: new Date().toISOString(),
    datasets: model.status,
    kpis: model.kpis,
    monthlySales: monthlySales(model.invoices).slice(-12),
    topProducts: topProductsByRevenue(model.invoiceItems, model.productIndex).slice(0, 8),
    topCustomers: topCustomersByRevenue(model.invoices).slice(0, 8),
    recentInvoices: recentInvoices(model.invoices).slice(0, 8),
    quality: qualitySignals(model),
    search: searchTables(model.tables, input.query).slice(0, 18),
  };
}

export async function renderDashboardLayout(layout, options = {}) {
  const model = await loadDataModel();
  const normalized = normalizeDashboardLayout(layout);

  return {
    generatedAt: new Date().toISOString(),
    datasets: model.status,
    catalog: getWidgetCatalog(),
    widgets: normalized.widgets.map((item) => renderDataWidgetFromModel(model, item)),
    search: searchTables(model.tables, options.query).slice(0, 18),
  };
}

export async function renderDataWidget(config) {
  const model = await loadDataModel();
  return renderDataWidgetFromModel(model, normalizeWidgetConfig(config));
}

export async function getProductMergeRows(input = {}) {
  const model = await loadDataModel();
  const query = clean(input.query).toLowerCase();
  const rows = groupedItems(model.invoiceItems, model.productIndex, { includeSourceNames: true })
    .sort((a, b) => b.revenue - a.revenue)
    .filter((row) => {
      if (!query) return true;
      return [row.name, row.productCode, row.brand, row.category, ...(row.sourceNames || [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return {
    generatedAt: new Date().toISOString(),
    file: "Invoice_items.csv",
    rows,
  };
}

export function normalizeDashboardLayout(layout = defaultDashboardLayout) {
  const widgets = Array.isArray(layout?.widgets) ? layout.widgets : defaultDashboardLayout.widgets;
  return {
    version: 1,
    widgets: widgets.slice(0, 24).map((item) => normalizeWidgetConfig(item)),
  };
}

function renderDataWidgetFromModel(model, config) {
  const result = widgetResult(model, config);
  return {
    config,
    result,
  };
}

function widgetResult(model, config) {
  const limit = clampedLimit(config.limit);
  const pageSize = clampedPageSize(config.pageSize, limit);

  if (config.preset === "kpi.revenue") return kpiResult(model.kpis.revenue, "SAR");
  if (config.preset === "kpi.paid") return kpiResult(model.kpis.paid, "SAR");
  if (config.preset === "kpi.unpaid") return kpiResult(model.kpis.unpaid, "SAR");
  if (config.preset === "kpi.invoices") return kpiResult(model.kpis.invoices);
  if (config.preset === "kpi.clients") return kpiResult(model.kpis.clients);
  if (config.preset === "kpi.products") return kpiResult(model.kpis.products);
  if (config.preset === "kpi.units") return kpiResult(model.kpis.units);
  if (config.preset === "kpi.averageInvoice") return kpiResult(model.kpis.averageInvoice, "SAR");
  if (config.preset === "time.monthlyRevenue") {
    const rows = monthlySales(model.invoices).slice(-limit);
    return timeResult(rows, pageSize, config.view, "revenue", "SAR", ["month", "revenue", "invoices"]);
  }
  if (config.preset === "time.monthlyInvoices") {
    const rows = monthlySales(model.invoices).slice(-limit);
    return timeResult(rows, pageSize, config.view, "invoices", "", ["month", "invoices", "revenue"]);
  }
  if (config.preset === "ranking.topCustomersRevenue") return rankingResult(topCustomersByRevenue(model.invoices).slice(0, limit), pageSize, config.view, "name", "revenue", "SAR", ["name", "revenue", "invoices"]);
  if (config.preset === "ranking.topCustomersQuantity") return rankingResult(topCustomersByQuantity(model.invoices, model.invoiceItems).slice(0, limit), pageSize, config.view, "name", "quantity", "", ["name", "quantity", "revenue"]);
  if (config.preset === "ranking.topProductsRevenue") return rankingResult(topProductsByRevenue(model.invoiceItems, model.productIndex).slice(0, limit), pageSize, config.view, "name", "revenue", "SAR", ["name", "revenue", "quantity", "productCode"]);
  if (config.preset === "ranking.topProductsQuantity") return rankingResult(topProductsByQuantity(model.invoiceItems, model.productIndex).slice(0, limit), pageSize, config.view, "name", "quantity", "", ["name", "quantity", "revenue", "productCode"]);
  if (config.preset === "ranking.topCitiesRevenue") return rankingResult(topCitiesByRevenue(model.invoices).slice(0, limit), pageSize, config.view, "city", "revenue", "SAR", ["city", "revenue", "invoices"]);
  if (config.preset === "ranking.unpaidCustomers") return rankingResult(unpaidCustomers(model.invoices).slice(0, limit), pageSize, config.view, "name", "unpaid", "SAR", ["name", "unpaid", "invoices"]);
  if (config.preset === "table.recentInvoices") return tableResult(recentInvoices(model.invoices).slice(0, limit), pageSize, ["invoiceNo", "client", "date", "total", "status"]);
  if (config.preset === "table.unpaidInvoices") return tableResult(unpaidInvoices(model.invoices).slice(0, limit), pageSize, ["invoiceNo", "client", "date", "unpaid"]);
  if (config.preset === "table.productList") return tableResult(productList(model.products).slice(0, limit), pageSize, ["code", "name", "price", "brand"]);
  if (config.preset === "table.clientList") return tableResult(clientList(model.clients).slice(0, limit), pageSize, ["clientNo", "name", "phone", "city"]);
  if (config.preset === "quality.dataQuality") return listResult(qualityRows(model));
  if (config.preset === "sources.dataSources") return sourcesResult(model.status);

  throw new AppError("Unsupported data widget preset.", 400);
}

async function loadDataModel() {
  const loaded = await loadDatasets();
  const invoices = loaded.tables.invoices?.rows || [];
  const invoiceItems = loaded.tables.invoiceItems?.rows || [];
  const clients = loaded.tables.clients?.rows || [];
  const products = loaded.tables.products?.rows || [];

  return {
    ...loaded,
    invoices,
    invoiceItems,
    clients,
    products,
    productIndex: buildProductIndex(products),
    kpis: kpis({ invoices, invoiceItems, clients, products }),
  };
}

async function loadDatasets() {
  const tables = {};
  const status = [];

  for (const dataset of datasets) {
    const filePath = path.join(dataRoot, dataset.file);
    try {
      const text = await fs.readFile(filePath, "utf8");
      const table = parseCsv(text);
      tables[dataset.key] = { ...dataset, path: filePath, ...table };
      status.push({
        key: dataset.key,
        label: dataset.label,
        file: dataset.file,
        required: dataset.required,
        available: true,
        rows: table.rows.length,
        columns: table.headers.length,
      });
    } catch {
      tables[dataset.key] = { ...dataset, path: filePath, headers: [], rows: [] };
      status.push({
        key: dataset.key,
        label: dataset.label,
        file: dataset.file,
        required: dataset.required,
        available: false,
        rows: 0,
        columns: 0,
      });
    }
  }

  return { tables, status };
}

function normalizeWidgetConfig(input = {}) {
  const definition = presetDefinition(input.preset);
  const title = clean(input.title || definition.title).slice(0, 80) || definition.title;
  return {
    id: clean(input.id || `${definition.id}-${Date.now()}`).slice(0, 80),
    type: definition.type,
    preset: definition.id,
    title,
    view: allowedView(input.view, definition.view),
    size: allowedSize(input.size, definition.size),
    limit: clampedLimit(input.limit || definition.limit || 12),
    pageSize: clampedPageSize(input.pageSize || definition.pageSize || 10, input.limit || definition.limit || 12),
  };
}

function presetDefinition(preset) {
  const found = presetDefinitions.find((item) => item.id === preset);
  if (!found) throw new AppError("Unsupported data widget preset.", 400);
  return found;
}

function allowedView(value, fallback) {
  return new Set(["card", "table", "bar", "list"]).has(value) ? value : fallback;
}

function allowedSize(value, fallback) {
  return new Set(["small", "medium", "wide"]).has(value) ? value : fallback;
}

function clampedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(maxWidgetLimit, parsed));
}

function clampedPageSize(value, limit) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Math.min(10, clampedLimit(limit));
  return Math.max(1, Math.min(clampedLimit(limit), parsed));
}

function kpis({ invoices, invoiceItems, clients, products }) {
  const revenue = sum(invoices, "SummaryTotal");
  const paid = sum(invoices, "SummaryPaid");
  const unpaid = sum(invoices, "SummaryUnpaid");
  const units = sum(invoiceItems, "quantity");
  const lastInvoice = latestByDate(invoices, "Date");

  return {
    revenue,
    paid,
    unpaid,
    invoices: invoices.length,
    clients: uniqueCount(clients, "ClientNumber"),
    products: products.length,
    units,
    averageInvoice: invoices.length ? revenue / invoices.length : 0,
    lastInvoiceDate: lastInvoice?.Date || null,
  };
}

function monthlySales(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const month = invoiceMonth(invoice.Date);
    if (!month) continue;
    const existing = groups.get(month) || { month, revenue: 0, invoices: 0 };
    existing.revenue += number(invoice.SummaryTotal);
    existing.invoices += 1;
    groups.set(month, existing);
  }
  return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function topProductsByRevenue(invoiceItems, productIndex) {
  return groupedItems(invoiceItems, productIndex).sort((a, b) => b.revenue - a.revenue);
}

function topProductsByQuantity(invoiceItems, productIndex) {
  return groupedItems(invoiceItems, productIndex).sort((a, b) => b.quantity - a.quantity);
}

function groupedItems(invoiceItems, productIndex, options = {}) {
  const groups = new Map();
  for (const item of invoiceItems) {
    const product = productIdentity(item, productIndex);
    const name = product.name;
    if (!name) continue;
    const existing = groups.get(product.key) || {
      id: product.key,
      name,
      productCode: product.productCode,
      barcode: product.barcode,
      brand: product.brand,
      category: product.category,
      revenue: 0,
      quantity: 0,
      invoices: new Set(),
      sourceNames: new Set(),
    };
    existing.revenue += number(item.subtotal);
    existing.quantity += number(item.quantity);
    if (item.no) existing.invoices.add(clean(item.no));
    if (item.item) existing.sourceNames.add(clean(item.item));
    groups.set(product.key, existing);
  }
  return [...groups.values()].map((item) => ({
    ...item,
    invoices: item.invoices.size,
    variants: item.sourceNames.size,
    sourceNames: options.includeSourceNames ? [...item.sourceNames].sort((a, b) => a.localeCompare(b)) : undefined,
  }));
}

function buildProductIndex(products) {
  const byKey = new Map();
  const bySkeleton = new Map();

  for (const product of products) {
    const name = displayProductName(product.Name);
    if (!name) continue;
    const indexed = {
      id: clean(product.id),
      productCode: clean(product.ProductCode),
      barcode: clean(product.Barcode),
      name,
      brand: clean(product.Brand),
      category: clean(product.Category),
    };
    for (const alias of [product.Name, name]) {
      const key = productTextKey(alias);
      const skeleton = productSkeletonKey(alias);
      if (key && !byKey.has(key)) byKey.set(key, indexed);
      if (skeleton && !bySkeleton.has(skeleton)) bySkeleton.set(skeleton, indexed);
    }
  }

  return { byKey, bySkeleton };
}

function productIdentity(item, productIndex) {
  const rawName = clean(item.item || item.description || "Unknown product");
  const key = productTextKey(rawName);
  const skeleton = productSkeletonKey(rawName);
  const product = productIndex?.byKey.get(key) || productIndex?.bySkeleton.get(skeleton);

  if (product) {
    return {
      key: `product:${product.productCode || product.barcode || product.id || product.name}`,
      name: product.name,
      productCode: product.productCode,
      barcode: product.barcode,
      brand: product.brand,
      category: product.category,
    };
  }

  return {
    key: `text:${skeleton || key || "unknown"}`,
    name: displayProductName(rawName),
    productCode: "",
    barcode: "",
    brand: "",
    category: "",
  };
}

function topCustomersByRevenue(invoices) {
  return groupedCustomers(invoices).sort((a, b) => b.revenue - a.revenue);
}

function topCustomersByQuantity(invoices, invoiceItems) {
  const invoiceQuantity = new Map();
  for (const item of invoiceItems) {
    const invoiceNo = clean(item.no);
    if (!invoiceNo) continue;
    invoiceQuantity.set(invoiceNo, (invoiceQuantity.get(invoiceNo) || 0) + number(item.quantity));
  }
  return groupedCustomers(invoices, invoiceQuantity).sort((a, b) => b.quantity - a.quantity);
}

function groupedCustomers(invoices, invoiceQuantity = new Map()) {
  const groups = new Map();
  for (const invoice of invoices) {
    const key = clean(invoice.ClientNo || invoice.ClientBusinessName || "Unknown");
    const name = customerDisplayName(invoice);
    const existing = groups.get(key) || { name, clientNo: clean(invoice.ClientNo), revenue: 0, quantity: 0, invoices: 0, latestDate: "" };
    existing.revenue += number(invoice.SummaryTotal);
    existing.quantity += invoiceQuantity.get(clean(invoice.InvoiceNo)) || 0;
    existing.invoices += 1;
    if (clean(invoice.Date) > existing.latestDate) existing.latestDate = clean(invoice.Date);
    groups.set(key, existing);
  }
  return [...groups.values()];
}

function customerDisplayName(invoice) {
  const clientNo = clean(invoice.ClientNo);
  const name = clean(invoice.ClientBusinessName || `${invoice.ClientFirstName || ""} ${invoice.ClientLastName || ""}`);
  if (!name) return clientNo ? `Client ${clientNo}` : "Unknown customer";
  if (isGenericCustomerName(name) && clientNo) return `${name} #${clientNo}`;
  return name;
}

function isGenericCustomerName(value) {
  const normalized = clean(value).toLowerCase();
  return new Set(["عميل", "pos client", "client", "customer"]).has(normalized);
}

function topCitiesByRevenue(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const city = clean(invoice.ClientCity || "Unknown");
    const existing = groups.get(city) || { city, revenue: 0, invoices: 0 };
    existing.revenue += number(invoice.SummaryTotal);
    existing.invoices += 1;
    groups.set(city, existing);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

function unpaidCustomers(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const unpaid = number(invoice.SummaryUnpaid);
    if (unpaid <= 0) continue;
    const key = clean(invoice.ClientNo || invoice.ClientBusinessName || "Unknown");
    const name = clean(invoice.ClientBusinessName || invoice.ClientNo || "Unknown customer");
    const existing = groups.get(key) || { name, clientNo: clean(invoice.ClientNo), unpaid: 0, invoices: 0 };
    existing.unpaid += unpaid;
    existing.invoices += 1;
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => b.unpaid - a.unpaid);
}

function recentInvoices(invoices) {
  return [...invoices]
    .sort((a, b) => clean(b.Date).localeCompare(clean(a.Date)))
    .map((invoice) => ({
      invoiceNo: clean(invoice.InvoiceNo),
      client: clean(invoice.ClientBusinessName || `${invoice.ClientFirstName || ""} ${invoice.ClientLastName || ""}`),
      date: clean(invoice.Date),
      total: number(invoice.SummaryTotal),
      paid: number(invoice.SummaryPaid),
      status: clean(invoice.PaymentStatus),
    }));
}

function unpaidInvoices(invoices) {
  return recentInvoices(invoices)
    .map((invoice) => ({ ...invoice, unpaid: invoice.total - invoice.paid }))
    .filter((invoice) => invoice.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid);
}

function productList(products) {
  return products.map((product) => ({
    code: clean(product.ProductCode),
    name: clean(product.Name),
    price: number(product.UnitPrice),
    brand: clean(product.Brand),
    category: clean(product.Category),
  }));
}

function clientList(clients) {
  return clients.map((client) => ({
    clientNo: clean(client.ClientNumber),
    name: clean(client.BusinessName || `${client.FirstName || ""} ${client.LastName || ""}`),
    phone: clean(client.Phone1 || client.mobile || client.HomePhone),
    city: clean(client.City),
  }));
}

function qualitySignals({ invoices, clients, products }) {
  return {
    unpaidInvoices: invoices.filter((invoice) => number(invoice.SummaryUnpaid) > 0).length,
    clientsWithoutPhone: clients.filter((client) => !clean(client.Phone1 || client.mobile || client.HomePhone)).length,
    productsWithoutPrice: products.filter((product) => number(product.UnitPrice) <= 0).length,
    duplicateClientNumbers: duplicateCount(clients, "ClientNumber"),
  };
}

function qualityRows(model) {
  const quality = qualitySignals(model);
  return [
    { label: "Unpaid invoices", value: quality.unpaidInvoices },
    { label: "Clients without phone", value: quality.clientsWithoutPhone },
    { label: "Products without price", value: quality.productsWithoutPrice },
    { label: "Duplicate client numbers", value: quality.duplicateClientNumbers },
  ];
}

function searchTables(tables, query) {
  const needle = clean(query).toLowerCase();
  if (!needle) return [];

  return [
    ...searchRows(tables.clients?.rows || [], "Client", ["ClientNumber", "BusinessName", "Phone1", "mobile", "Email", "City"], needle),
    ...searchRows(tables.invoices?.rows || [], "Invoice", ["InvoiceNo", "ClientNo", "ClientBusinessName", "Date", "PaymentStatus"], needle),
    ...searchRows(tables.products?.rows || [], "Product", ["ProductCode", "Barcode", "Name", "Brand", "Category"], needle),
  ];
}

function searchRows(rows, type, fields, needle) {
  const results = [];
  for (const row of rows) {
    const haystack = fields.map((field) => clean(row[field])).join(" ").toLowerCase();
    if (!haystack.includes(needle)) continue;
    results.push({
      type,
      title: clean(row.BusinessName || row.ClientBusinessName || row.Name || row.InvoiceNo || row.ProductCode),
      meta: fields
        .map((field) => clean(row[field]))
        .filter(Boolean)
        .slice(0, 4)
        .join(" · "),
    });
  }
  return results;
}

function kpiResult(value, unit = "") {
  return { kind: "kpi", value, unit };
}

function timeResult(rows, pageSize, view, valueField, unit, columns) {
  if (view === "table") return tableResult(rows, pageSize, columns);
  return seriesResult(rows, valueField, unit, "month");
}

function rankingResult(rows, pageSize, view, labelField, valueField, unit, columns) {
  if (view === "bar") return seriesResult(rows.slice(0, pageSize), valueField, unit, labelField);
  return tableResult(rows, pageSize, columns);
}

function seriesResult(rows, valueField, unit = "", labelField = "month") {
  return { kind: "series", rows, valueField, labelField, unit };
}

function tableResult(rows, pageSize, columns) {
  return { kind: "table", rows, visibleRows: rows.slice(0, pageSize), pageSize, totalRows: rows.length, columns };
}

function listResult(rows) {
  return { kind: "list", rows };
}

function sourcesResult(rows) {
  return { kind: "sources", rows };
}

function parseCsv(text) {
  const rows = csvRows(String(text || "").replace(/^\uFEFF/, ""));
  const headers = (rows.shift() || []).map((header, index) => clean(header).replace(/^\uFEFF/, "") || `column_${index + 1}`);
  return {
    headers,
    rows: rows
      .filter((row) => row.some((cell) => clean(cell)))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])] ))),
  };
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function latestByDate(rows, field) {
  return [...rows].sort((a, b) => clean(b[field]).localeCompare(clean(a[field])))[0] || null;
}

function invoiceMonth(value) {
  const match = /^(\d{4})-(\d{2})/.exec(clean(value));
  return match ? `${match[1]}-${match[2]}` : "";
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + number(row[field]), 0);
}

function uniqueCount(rows, field) {
  return new Set(rows.map((row) => clean(row[field])).filter(Boolean)).size;
}

function duplicateCount(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = clean(row[field]);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function number(value) {
  const cleaned = clean(value).replace(/[,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayProductName(value) {
  return clean(value)
    .replace(/\b[Cc]ens\b/g, "Lens")
    .replace(/\b[Ss]+unglasses\b/g, "sunglasses")
    .replace(/\b[Ss]anglasses\b/g, "Sunglasses")
    .replace(/\b[Ee]yeglasses\b/g, "Eyeglasses")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function productTextKey(value) {
  return normalizeArabic(displayProductName(value))
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^0-9a-z\u0600-\u06ff]+/g, " ")
    .replace(/\b(cens|lens)\b/g, "lens")
    .replace(/\b(ssunglasses|sanglasses|sunglasses)\b/g, "sunglasses")
    .replace(/\beyeglasses\b/g, "eyeglasses")
    .replace(/\s+/g, " ")
    .trim();
}

function productSkeletonKey(value) {
  return productTextKey(value).replace(/\s+/g, "");
}

function normalizeArabic(value) {
  return clean(value)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

function clean(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}
