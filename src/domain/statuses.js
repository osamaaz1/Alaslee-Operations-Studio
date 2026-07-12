// Defines persisted batch and product lifecycle statuses.

export const PRODUCT_STATUSES = Object.freeze({
  UPLOADED: "uploaded",
  QUEUED: "queued",
  GENERATING: "generating",
  GENERATED: "generated",
  PREVIEW: "preview",
  FAILED: "failed",
});

export const BATCH_STATUSES = Object.freeze({
  IMPORTED: "imported",
  GENERATING: "generating",
  GENERATED: "generated",
  PARTIAL: "partial",
  FAILED: "failed",
});

export const INPUT_MODES = Object.freeze({
  SINGLE_UPLOAD: "single_upload",
  BATCH_FOLDER: "batch_folder",
INSTAGRAM_DIRECT_UPLOAD: "instagram_direct_upload",
  DEBUG_PREVIEW: "debug_preview",
});
