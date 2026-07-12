// Handles switching between workflow panels.

export function switchView(dom, viewName) {
  const activeRailView = viewName === "batch" ? "single" : viewName;

  for (const button of dom.railButtons) {
    button.classList.toggle("active", button.dataset.view === activeRailView);
  }

  for (const panel of dom.panels) {
    panel.classList.toggle("active", panel.dataset.panel === viewName);
  }
}

export function switchPartition(dom, partitionName) {
  for (const button of dom.partitionButtons) {
    button.classList.toggle("active", button.dataset.partition === partitionName);
  }

  for (const panel of dom.partitionPanels) {
    const active = panel.dataset.partitionPanel === partitionName;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
}
