// Defines product image roles and batch filename parsing rules.

export const REQUIRED_IMAGE_ROLES = Object.freeze(["front", "side", "angle"]);
export const SINGLE_UPLOAD_IMAGE_ROLES = Object.freeze(["front", "side", "angle", "temple"]);

export const ORIGINAL_ROLE_ORDER = Object.freeze({
  front: 1,
  side: 2,
  angle: 3,
  temple: 4,
});

export const GENERATED_ROLE_ORDER = Object.freeze({
  front: 1,
  side: 2,
  angle: 3,
  hero: 4,
  "instagram-front": 5,
  "instagram-angle": 6,
});

export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([".jpg", ".jpeg", ".png", ".webp"]);
export const BATCH_FILENAME_PATTERN = /^(.+)-(\d+)\.(jpe?g|png|webp)$/i;

export function roleFromBatchIndex(index) {
  if (index === 1) return "front";
  if (index === 2) return "side";
  if (index === 3) return "angle";
  if (index === 4) return "temple";
  return `detail-${index}`;
}

export function originalRoleSortValue(role) {
  if (ORIGINAL_ROLE_ORDER[role]) return ORIGINAL_ROLE_ORDER[role];

  const detailMatch = /^detail-(\d+)$/.exec(role);
  if (!detailMatch) return Number.MAX_SAFE_INTEGER;

  return Number.parseInt(detailMatch[1], 10);
}

export function generatedRoleSortValue(role) {
  return GENERATED_ROLE_ORDER[role] || Number.MAX_SAFE_INTEGER;
}
