// Renders and edits the unified Data workspace dashboard.

import {
  loadDataDashboardProfile as apiLoadDataDashboardProfile,
  loadDataDashboardProfiles as apiLoadDataDashboardProfiles,
  loadDataProductMergeRows as apiLoadDataProductMergeRows,
  loadDataWidgetCatalog as apiLoadDataWidgetCatalog,
  mergeDataProductRows as apiMergeDataProductRows,
  previewDataWidget as apiPreviewDataWidget,
  saveDataDashboardProfile as apiSaveDataDashboardProfile,
} from "../apiClient.js";

export function bindDataWorkspace(dom, state, actions) {
  dom.dataRefreshButton.addEventListener("click", () => refreshDataWorkspace(dom, state, actions, ""));
  dom.dataSearchButton.addEventListener("click", () =>
    refreshDataWorkspace(dom, state, actions, dom.dataSearchInput.value.trim()),
  );
  dom.dataSearchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    refreshDataWorkspace(dom, state, actions, dom.dataSearchInput.value.trim());
  });
  dom.dataProfileSelect.addEventListener("change", () => {
    state.dataWorkspaceProfileId = dom.dataProfileSelect.value || "default";
    refreshDataWorkspace(dom, state, actions, state.dataWorkspaceQuery);
  });
  dom.dataCustomizeButton.addEventListener("click", () => setDataEditMode(dom, state, true));
  dom.dataCancelEditButton.addEventListener("click", () => {
    setDataEditMode(dom, state, false);
    refreshDataWorkspace(dom, state, actions, state.dataWorkspaceQuery);
  });
  dom.dataSaveLayoutButton.addEventListener("click", () => safeDataAction(actions, saveLayout(dom, state, actions)));
  dom.dataAddWidgetButton.addEventListener("click", () => safeDataAction(actions, addWidget(dom, state, actions)));
  dom.dataUpdateWidgetButton.addEventListener("click", () => safeDataAction(actions, updateWidget(dom, state, actions)));
  dom.dataClearWidgetButton.addEventListener("click", () => clearBuilder(dom, state));
  dom.dataWidgetPreset.addEventListener("change", () => syncBuilderPreset(dom, state));
  dom.dataMergeSearch.addEventListener("input", () => {
    state.dataMergeQuery = dom.dataMergeSearch.value.trim();
    renderProductMerge(dom, state);
  });
  dom.dataMergeApplyButton.addEventListener("click", () => safeDataAction(actions, applyProductMerge(dom, state, actions)));
  dom.dataMergeResults.addEventListener("click", (event) => handleProductMergePick(event, dom));
  dom.dataWidgetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-widget-action]");
    if (!button) return;
    safeDataAction(actions, runWidgetAction(dom, state, actions, button.dataset.widgetAction, button.dataset.widgetId));
  });
}

export async function refreshDataWorkspace(dom, state, actions, query = state.dataWorkspaceQuery || "") {
  state.dataWorkspaceQuery = query;
  setDataLoading(dom, true);

  try {
    if (!state.dataCatalog) {
      state.dataCatalog = await apiLoadDataWidgetCatalog();
      populateBuilderOptions(dom, state);
    }
    state.dataProfiles = await apiLoadDataDashboardProfiles();
    renderProfiles(dom, state);
    state.dataWorkspace = await apiLoadDataDashboardProfile(state.dataWorkspaceProfileId, query);
    pruneWidgetVisibleRows(state);
    renderDataWorkspace(dom, state);
    await refreshProductMerge(dom, state, actions);
  } catch (error) {
    actions.warn(error?.message || "Data workspace unavailable");
  } finally {
    setDataLoading(dom, false);
  }
}

export function renderDataWorkspace(dom, state) {
  const data = state.dataWorkspace || {};
  dom.dataStatus.textContent = sourceStatus(data.datasets || []);
  dom.dataLayoutStatus.textContent = state.dataEditing ? "Editing layout" : `${data.profile?.name || "Default"} layout`;
  renderWidgetGrid(dom, state);
  renderSearch(dom, data.search || [], state.dataWorkspaceQuery);
  setDataEditMode(dom, state, state.dataEditing);
}

function renderWidgetGrid(dom, state) {
  const widgets = state.dataWorkspace?.widgets || [];
  dom.dataWidgetGrid.replaceChildren();
  if (widgets.length === 0) {
    dom.dataWidgetGrid.append(emptyNode("No windows yet. Add one from Customize."));
    return;
  }
  for (const widget of widgets) {
    dom.dataWidgetGrid.append(widgetNode(widget, state));
  }
}

function widgetNode(widget, state) {
  const article = document.createElement("article");
  const head = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("span");
  const body = document.createElement("div");
  article.className = `data-widget size-${widget.config.size || "medium"}`;
  head.className = "data-widget-head";
  body.className = "data-widget-body";
  title.textContent = widget.config.title;
  meta.textContent = widget.config.preset;
  head.append(title, meta);
  if (state.dataEditing) {
    head.append(widgetActions(widget.config.id));
  }
  body.append(renderWidgetResult(widget, state));
  article.append(head, body);
  return article;
}

function widgetActions(widgetId) {
  const actions = document.createElement("div");
  const buttons = [
    ["Edit", "edit"],
    ["Copy", "duplicate"],
    ["Up", "move-up"],
    ["Down", "move-down"],
    ["Remove", "remove"],
  ];
  actions.className = "data-widget-actions";
  for (const [label, action] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action === "remove" ? "text-button danger-text-button" : "text-button";
    button.dataset.widgetAction = action;
    button.dataset.widgetId = widgetId;
    button.textContent = label;
    actions.append(button);
  }
  return actions;
}

async function runWidgetAction(dom, state, actions, action, widgetId) {
  const widgets = state.dataWorkspace?.widgets || [];
  const index = widgets.findIndex((item) => item.config.id === widgetId);
  if (index < 0) return;

  if (action === "show-more") {
    showMoreWidgetRows(dom, state, widgets[index]);
    return;
  }
  if (action === "edit") {
    fillBuilder(dom, state, widgets[index].config);
    return;
  }
  if (action === "remove") {
    state.dataWidgetVisibleRows.delete(widgetId);
    widgets.splice(index, 1);
    state.dataWorkspace.layout.widgets.splice(index, 1);
    renderDataWorkspace(dom, state);
    return;
  }
  if (action === "move-up" && index > 0) {
    move(widgets, index, index - 1);
    move(state.dataWorkspace.layout.widgets, index, index - 1);
    renderDataWorkspace(dom, state);
    return;
  }
  if (action === "move-down" && index < widgets.length - 1) {
    move(widgets, index, index + 1);
    move(state.dataWorkspace.layout.widgets, index, index + 1);
    renderDataWorkspace(dom, state);
    return;
  }
  if (action === "duplicate") {
    const config = { ...widgets[index].config, id: widgetIdFromPreset(widgets[index].config.preset), title: `${widgets[index].config.title} copy` };
    const preview = await apiPreviewDataWidget(config);
    state.dataWorkspace.layout.widgets.splice(index + 1, 0, preview.config);
    state.dataWorkspace.widgets.splice(index + 1, 0, preview);
    renderDataWorkspace(dom, state);
    actions.succeed("Window duplicated");
  }
}

function renderWidgetResult(widget, state) {
  const result = widget.result || {};
  if (result.kind === "kpi") return kpiNode(result);
  if (result.kind === "series") return seriesNode(result);
  if (result.kind === "table") return tableNode(result, widget.config.id, state);
  if (result.kind === "list") return listNode(result.rows || []);
  if (result.kind === "sources") return sourcesNode(result.rows || []);
  return emptyNode("No data");
}

function kpiNode(result) {
  const node = document.createElement("div");
  const value = document.createElement("strong");
  const unit = document.createElement("span");
  node.className = "data-kpi-widget";
  value.textContent = formatValue(result.value, result.unit);
  unit.textContent = result.unit || "";
  node.append(value, unit);
  return node;
}

function seriesNode(result) {
  const node = document.createElement("div");
  const rows = result.rows || [];
  const max = Math.max(...rows.map((row) => Number(row[result.valueField] || 0)), 1);
  const labelField = result.labelField || "month";
  node.className = "data-bars compact-bars";
  if (rows.length === 0) return emptyNode("No series data");
  for (const row of rows) {
    const wrapper = document.createElement("div");
    const fill = document.createElement("div");
    const label = document.createElement("span");
    wrapper.className = "data-bar";
    fill.className = "data-bar-fill";
    fill.style.height = `${Math.max(5, Math.round((Number(row[result.valueField] || 0) / max) * 120))}px`;
    fill.title = `${row[labelField] || "-"}: ${formatValue(row[result.valueField], result.unit)}`;
    label.textContent = shortLabel(row[labelField], labelField);
    wrapper.append(fill, label);
    node.append(wrapper);
  }
  return node;
}

function tableNode(result, widgetId, state) {
  const node = document.createElement("div");
  node.className = "data-table";
  const rows = visibleTableRows(result, widgetId, state);
  const totalRows = tableTotalRows(result);
  if (rows.length === 0) return emptyNode("No rows");
  for (const row of rows) {
    node.append(dataRow(primaryText(row, result.columns), secondaryText(row, result.columns)));
  }
  if (totalRows > rows.length) {
    node.append(tableMoreRow(widgetId, rows.length, totalRows, tablePageSize(result)));
  } else if (totalRows > tableDefaultVisibleRows(result)) {
    const footer = document.createElement("div");
    footer.className = "data-more-row";
    footer.textContent = `Showing ${rows.length} of ${totalRows}`;
    node.append(footer);
  }
  return node;
}

function listNode(rows) {
  const node = document.createElement("div");
  node.className = "data-table";
  for (const row of rows) {
    node.append(dataRow(row.label, number(row.value)));
  }
  return node;
}

function sourcesNode(rows) {
  const node = document.createElement("div");
  node.className = "data-source-list";
  for (const source of rows) {
    const row = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const dot = document.createElement("i");
    row.className = `data-source ${source.available ? "ready" : ""}`;
    title.textContent = source.label;
    meta.textContent = source.available
      ? `${number(source.rows)} rows · ${number(source.columns)} columns`
      : source.required
        ? "Required file missing"
        : "Optional file missing";
    row.append(title, meta, dot);
    node.append(row);
  }
  return node;
}

function renderSearch(dom, rows, query) {
  dom.dataSearchResults.replaceChildren();
  if (!query) {
    dom.dataSearchStatus.textContent = "Type and search";
    dom.dataSearchResults.append(emptyNode("Search customers, invoices, or products"));
    return;
  }
  dom.dataSearchStatus.textContent = `${number(rows.length)} result(s)`;
  if (rows.length === 0) {
    dom.dataSearchResults.append(emptyNode("No matching records"));
    return;
  }
  for (const row of rows) {
    dom.dataSearchResults.append(dataRow(`${row.type}: ${row.title || "-"}`, row.meta || ""));
  }
}

async function refreshProductMerge(dom, state, actions) {
  try {
    state.dataProductMerge = await apiLoadDataProductMergeRows();
    renderProductMerge(dom, state);
  } catch (error) {
    dom.dataMergeStatus.textContent = "Product merge unavailable";
    actions.warn(error?.message || "Product merge data unavailable");
  }
}

function renderProductMerge(dom, state) {
  const rows = filteredProductMergeRows(state);
  dom.dataMergeStatus.textContent = `${number(rows.length)} unique product row(s)`;
  dom.dataMergeResults.replaceChildren();
  replaceOptions(dom.dataMergeSource, rows.map((row) => [row.id, productOptionLabel(row)]));
  replaceOptions(dom.dataMergeTarget, rows.map((row) => [row.id, productOptionLabel(row)]));

  if (rows.length === 0) {
    dom.dataMergeResults.append(emptyNode("No matching product rows"));
    return;
  }
  for (const row of rows) {
    dom.dataMergeResults.append(productMergeRow(row));
  }
}

function filteredProductMergeRows(state) {
  const rows = state.dataProductMerge?.rows || [];
  const query = String(state.dataMergeQuery || "").toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    [row.name, row.productCode, row.brand, row.category, ...(row.sourceNames || [])]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function productMergeRow(row) {
  const node = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  const actions = document.createElement("div");
  const sourceButton = mergePickButton("Source", "source", row.id);
  const targetButton = mergePickButton("Target", "target", row.id);
  node.className = "data-merge-row";
  copy.className = "data-merge-copy";
  actions.className = "data-merge-row-actions";
  title.textContent = row.name;
  meta.textContent = [
    money(row.revenue),
    `${number(row.quantity)} item(s)`,
    row.productCode ? `Code ${row.productCode}` : "",
    row.variants > 1 ? `${number(row.variants)} names` : "",
  ].filter(Boolean).join(" · ");
  copy.append(title, meta, sourceNamesNode(row.sourceNames || []));
  actions.append(sourceButton, targetButton);
  node.append(copy, actions);
  return node;
}

function sourceNamesNode(sourceNames) {
  const node = document.createElement("small");
  node.textContent = sourceNames.length > 1 ? `Source names: ${sourceNames.join(" | ")}` : "";
  return node;
}

function mergePickButton(label, pick, rowId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.dataset.mergePick = pick;
  button.dataset.rowId = rowId;
  button.textContent = label;
  return button;
}

function handleProductMergePick(event, dom) {
  const button = event.target.closest("[data-merge-pick]");
  if (!button) return;
  if (button.dataset.mergePick === "source") dom.dataMergeSource.value = button.dataset.rowId;
  if (button.dataset.mergePick === "target") dom.dataMergeTarget.value = button.dataset.rowId;
}

async function applyProductMerge(dom, state, actions) {
  const sourceId = dom.dataMergeSource.value;
  const targetId = dom.dataMergeTarget.value;
  if (!sourceId || !targetId) {
    actions.warn("Choose source and target product rows.");
    return;
  }
  if (sourceId === targetId) {
    actions.warn("Choose two different product rows.");
    return;
  }
  const source = (state.dataProductMerge?.rows || []).find((row) => row.id === sourceId);
  const target = (state.dataProductMerge?.rows || []).find((row) => row.id === targetId);
  if (!source || !target) {
    actions.warn("Selected product rows are no longer available.");
    return;
  }
  const ok = confirm(`Merge "${source.name}" into "${target.name}"?\n\nThis updates Invoice_items.csv and creates a backup first.`);
  if (!ok) return;

  const result = await apiMergeDataProductRows({ sourceId, targetId });
  state.dataWidgetVisibleRows.clear();
  await refreshDataWorkspace(dom, state, actions, state.dataWorkspaceQuery);
  actions.succeed(`${number(result.changedRows)} invoice row(s) merged into ${result.target.name}`);
}

function populateBuilderOptions(dom, state) {
  replaceOptions(dom.dataWidgetPreset, state.dataCatalog.presets.map((item) => [item.id, item.title]));
  replaceOptions(dom.dataWidgetSize, state.dataCatalog.sizes.map((item) => [item.value, item.label]));
  replaceOptions(dom.dataWidgetView, state.dataCatalog.views.map((item) => [item.value, item.label]));
  syncBuilderPreset(dom, state);
}

function renderProfiles(dom, state) {
  const options = state.dataProfiles.map((profile) => [profile.id, profile.name]);
  replaceOptions(dom.dataProfileSelect, options);
  dom.dataProfileSelect.value = state.dataWorkspaceProfileId;
}

function setDataEditMode(dom, state, enabled) {
  state.dataEditing = enabled;
  dom.dataEditPanel.hidden = !enabled;
  dom.dataCustomizeButton.hidden = enabled;
  dom.dataSaveLayoutButton.hidden = !enabled;
  dom.dataCancelEditButton.hidden = !enabled;
  dom.dataLayoutStatus.textContent = enabled ? "Editing layout" : `${state.dataWorkspace?.profile?.name || "Default"} layout`;
  dom.dataWidgetGrid.classList.toggle("editing", enabled);
}

async function addWidget(dom, state, actions) {
  const config = builderConfig(dom);
  const preview = await apiPreviewDataWidget(config);
  state.dataWorkspace.layout.widgets.push(preview.config);
  state.dataWorkspace.widgets.push(preview);
  renderDataWorkspace(dom, state);
  actions.succeed("Window added");
}

async function updateWidget(dom, state, actions) {
  const widgetId = state.dataEditingWidgetId;
  const index = state.dataWorkspace.widgets.findIndex((item) => item.config.id === widgetId);
  if (index < 0) return;

  const preview = await apiPreviewDataWidget({ ...builderConfig(dom), id: widgetId });
  state.dataWidgetVisibleRows.delete(widgetId);
  state.dataWorkspace.layout.widgets[index] = preview.config;
  state.dataWorkspace.widgets[index] = preview;
  clearBuilder(dom, state);
  renderDataWorkspace(dom, state);
  actions.succeed("Window updated");
}

async function saveLayout(dom, state, actions) {
  const profileId = state.dataWorkspace?.profile?.id || "default";
  await apiSaveDataDashboardProfile(profileId, {
    name: state.dataWorkspace?.profile?.name || "Default",
    layout: state.dataWorkspace?.layout,
  });
  setDataEditMode(dom, state, false);
  await refreshDataWorkspace(dom, state, actions, state.dataWorkspaceQuery);
  actions.succeed("Data dashboard layout saved");
}

function fillBuilder(dom, state, config) {
  state.dataEditingWidgetId = config.id;
  dom.dataWidgetPreset.value = config.preset;
  dom.dataWidgetTitle.value = config.title;
  dom.dataWidgetSize.value = config.size;
  dom.dataWidgetView.value = config.view;
  dom.dataWidgetLimit.value = config.limit;
  dom.dataWidgetPageSize.value = config.pageSize;
  dom.dataAddWidgetButton.hidden = true;
  dom.dataUpdateWidgetButton.hidden = false;
}

function clearBuilder(dom, state) {
  state.dataEditingWidgetId = "";
  syncBuilderPreset(dom, state);
  dom.dataAddWidgetButton.hidden = false;
  dom.dataUpdateWidgetButton.hidden = true;
}

function syncBuilderPreset(dom, state) {
  const preset = state.dataCatalog?.presets.find((item) => item.id === dom.dataWidgetPreset.value);
  if (!preset) return;
  dom.dataWidgetTitle.value = preset.title;
  dom.dataWidgetSize.value = preset.size;
  dom.dataWidgetView.value = preset.view;
  dom.dataWidgetLimit.value = preset.limit || 10;
  dom.dataWidgetPageSize.value = preset.pageSize || Math.min(Number(preset.limit || 10), 10);
}

function builderConfig(dom) {
  return {
    id: widgetIdFromPreset(dom.dataWidgetPreset.value),
    preset: dom.dataWidgetPreset.value,
    title: dom.dataWidgetTitle.value,
    size: dom.dataWidgetSize.value,
    view: dom.dataWidgetView.value,
    limit: Number(dom.dataWidgetLimit.value || 10),
    pageSize: Number(dom.dataWidgetPageSize.value || 10),
  };
}

function setDataLoading(dom, loading) {
  dom.dataRefreshButton.disabled = loading;
  dom.dataSearchButton.disabled = loading;
  dom.dataProfileSelect.disabled = loading;
  dom.dataStatus.textContent = loading ? "Loading data" : dom.dataStatus.textContent;
}

function replaceOptions(select, options) {
  select.replaceChildren();
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

function dataRow(titleText, metaText) {
  const row = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  row.className = "data-row";
  title.textContent = titleText || "-";
  meta.textContent = metaText || "";
  row.append(title, meta);
  return row;
}

function productOptionLabel(row) {
  return [row.name, row.productCode ? `Code ${row.productCode}` : "", money(row.revenue)].filter(Boolean).join(" · ");
}

function emptyNode(text) {
  const node = document.createElement("div");
  node.className = "data-empty";
  node.textContent = text;
  return node;
}

function primaryText(row, columns = []) {
  const first = columns[0];
  const second = columns[1];
  return [valueFor(row, first), second && valueFor(row, second)].filter(Boolean).join(" · ");
}

function secondaryText(row, columns = []) {
  return columns.slice(2).map((column) => valueFor(row, column)).filter(Boolean).join(" · ");
}

function valueFor(row, key) {
  const value = row?.[key];
  if (value === undefined || value === null || value === "") return "";
  if (["revenue", "total", "paid", "unpaid", "price"].includes(key)) return money(value);
  if (["quantity", "invoices"].includes(key)) return number(value);
  if (key === "productCode") return `Code ${value}`;
  if (key === "variants") return `${number(value)} source name(s)`;
  return String(value);
}

function formatValue(value, unit) {
  return unit === "SAR" ? money(value) : number(value);
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("en-US")} SAR`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function shortLabel(value, field) {
  const text = String(value || "");
  if (field === "month") return text.slice(5) || "-";
  return text || "-";
}

function showMoreWidgetRows(dom, state, widget) {
  const result = widget.result || {};
  const totalRows = tableTotalRows(result);
  const currentRows = visibleTableRows(result, widget.config.id, state).length;
  const nextRows = Math.min(totalRows, currentRows + tablePageSize(result));
  state.dataWidgetVisibleRows.set(widget.config.id, nextRows);
  renderDataWorkspace(dom, state);
}

function visibleTableRows(result, widgetId, state) {
  const rows = result.rows || result.visibleRows || [];
  const totalRows = tableTotalRows(result);
  const defaultRows = tableDefaultVisibleRows(result);
  const storedRows = Number(state.dataWidgetVisibleRows.get(widgetId) || defaultRows);
  const count = Math.min(totalRows, Math.max(defaultRows, storedRows));
  return rows.slice(0, count);
}

function tableMoreRow(widgetId, visibleCount, totalRows, pageSize) {
  const footer = document.createElement("div");
  const count = document.createElement("span");
  const button = document.createElement("button");
  const nextCount = Math.min(pageSize, totalRows - visibleCount);
  footer.className = "data-table-footer";
  count.textContent = `Showing ${visibleCount} of ${totalRows}`;
  button.type = "button";
  button.className = "secondary-button data-more-button";
  button.dataset.widgetAction = "show-more";
  button.dataset.widgetId = widgetId;
  button.textContent = `Show next ${nextCount}`;
  footer.append(count, button);
  return footer;
}

function tableDefaultVisibleRows(result) {
  return Math.max(1, Number(result.visibleRows?.length || result.pageSize || 10));
}

function tablePageSize(result) {
  return Math.max(1, Number(result.pageSize || result.visibleRows?.length || 10));
}

function tableTotalRows(result) {
  return Number(result.totalRows || result.rows?.length || result.visibleRows?.length || 0);
}

function pruneWidgetVisibleRows(state) {
  const currentIds = new Set((state.dataWorkspace?.widgets || []).map((widget) => widget.config.id));
  for (const widgetId of state.dataWidgetVisibleRows.keys()) {
    if (!currentIds.has(widgetId)) state.dataWidgetVisibleRows.delete(widgetId);
  }
}

function sourceStatus(sources) {
  const available = sources.filter((source) => source.available).length;
  return `${available}/${sources.length} sources ready`;
}

function move(items, from, to) {
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

function widgetIdFromPreset(preset) {
  return `${String(preset || "widget").replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

async function safeDataAction(actions, task) {
  try {
    await task;
  } catch (error) {
    actions.warn(error?.message || "Data dashboard action failed");
  }
}
