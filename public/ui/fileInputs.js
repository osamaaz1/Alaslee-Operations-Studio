// Binds local file input labels and preview thumbnails.

export function bindProductFileNames(dom) {
  for (const input of dom.uploadForm.querySelectorAll('input[type="file"]')) {
    input.addEventListener("change", () => renderProductFileName(input));
  }
}

export function bindBrandAssetFileNames(dom) {
  for (const input of dom.brandingForm.querySelectorAll('input[type="file"]')) {
    input.addEventListener("change", () => {
      renderBrandAssetFileName(input);
      renderLocalAssetPreview(input);
    });
  }
}

export function clearSelectedAssetNames() {
  for (const target of document.querySelectorAll("[data-asset-file-name]")) {
    target.textContent = "";
  }
}

function renderProductFileName(input) {
  const target = document.querySelector(`[data-file-name="${input.name}"]`);
  target.textContent = input.files?.[0]?.name || "Choose JPG, PNG, or WEBP";
}

function renderBrandAssetFileName(input) {
  const target = document.querySelector(`[data-asset-file-name="${input.name}"]`);
  target.textContent = input.files?.[0]?.name || "";
}

function renderLocalAssetPreview(input) {
  const file = input.files?.[0];
  const preview = document.querySelector(`#${input.name}-preview`);
  if (!file || !preview) return;

  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  preview.addEventListener("load", () => URL.revokeObjectURL(preview.src), { once: true });
}
