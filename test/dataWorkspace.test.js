import { test } from "node:test";
import assert from "node:assert/strict";
import { getDataWorkspaceSummary, getWidgetCatalog, renderDataWidget } from "../src/services/dataWorkspaceService.js";

test("data workspace reads local OriginalEye exports", async () => {
  const summary = await getDataWorkspaceSummary({ query: "Escada" });

  assert.equal(summary.datasets.length, 5);
  assert.equal(summary.datasets.some((dataset) => dataset.key === "invoices" && dataset.available), true);
  assert.equal(summary.kpis.invoices > 0, true);
  assert.equal(summary.kpis.revenue > 0, true);
  assert.equal(summary.topProducts.length > 0, true);
  assert.equal(summary.search.length > 0, true);
});

test("data widgets support ranked quantity and paged visible rows", async () => {
  const catalog = getWidgetCatalog();
  assert.equal(catalog.presets.some((preset) => preset.id === "ranking.topCustomersQuantity"), true);

  const widget = await renderDataWidget({
    preset: "ranking.topCustomersQuantity",
    title: "Top 100 customers by items",
    limit: 100,
    pageSize: 10,
  });

  assert.equal(widget.result.kind, "table");
  assert.equal(widget.result.rows.length <= 100, true);
  assert.equal(widget.result.visibleRows.length <= 10, true);
  assert.equal(widget.result.columns.includes("quantity"), true);
});

test("data widgets switch compatible presets between table and chart views", async () => {
  const rankingChart = await renderDataWidget({
    preset: "ranking.topProductsRevenue",
    title: "Product revenue chart",
    view: "bar",
    limit: 100,
    pageSize: 10,
  });
  assert.equal(rankingChart.result.kind, "series");
  assert.equal(rankingChart.result.labelField, "name");
  assert.equal(rankingChart.result.valueField, "revenue");
  assert.equal(rankingChart.result.rows.length <= 10, true);

  const monthlyTable = await renderDataWidget({
    preset: "time.monthlyRevenue",
    title: "Monthly revenue table",
    view: "table",
    limit: 12,
    pageSize: 6,
  });
  assert.equal(monthlyTable.result.kind, "table");
  assert.equal(monthlyTable.result.visibleRows.length <= 6, true);
  assert.equal(monthlyTable.result.columns.includes("month"), true);
});

test("product rankings canonicalize repeated item names from invoices and product catalog", async () => {
  const widget = await renderDataWidget({
    preset: "ranking.topProductsRevenue",
    title: "Canonical products",
    limit: 20,
    pageSize: 20,
  });

  const rows = widget.result.rows;
  const medicalLens = rows.find((row) => row.name === "عدسة طبية - medical Lens");
  const spectraSunglasses = rows.filter((row) => /Spectra Sunglasses/i.test(row.name));

  assert.equal(Boolean(medicalLens), true);
  assert.equal(medicalLens.revenue > 73000, true);
  assert.equal(medicalLens.variants >= 2, true);
  assert.equal(rows.some((row) => /medical Cens/i.test(row.name)), false);
  assert.equal(spectraSunglasses.length, 1);
  assert.equal(spectraSunglasses[0].revenue > 37000, true);
});
