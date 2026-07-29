// Persists and reads branded Instagram image metadata.

import { db } from "../db/database.js";
import { generatedRoleSortValue } from "../domain/imageRoles.js";
import { removeFilesBestEffort } from "../utils/files.js";

export function listInstagramImages(productId) {
  return db
    .prepare("SELECT * FROM product_instagram_images WHERE product_id = ?")
    .all(productId)
    .sort((a, b) => generatedRoleSortValue(a.role) - generatedRoleSortValue(b.role));
}

export async function replaceInstagramImages(productId, images) {
  const now = new Date().toISOString();
  const existingPaths = db
    .prepare("SELECT path FROM product_instagram_images WHERE product_id = ?")
    .all(productId)
    .map((row) => row.path);
  const deleteExisting = db.prepare("DELETE FROM product_instagram_images WHERE product_id = ?");
  const insertImage = db.prepare(insertSql);

  db.transaction(() => {
    deleteExisting.run(productId);
    for (const image of images) {
      insertImage.run({ ...image, productId, now, actor: "system" });
    }
  })();

  await removeFilesBestEffort(existingPaths, images.map((image) => image.path));
}

export function insertInstagramImage(productId, image) {
  const now = new Date().toISOString();
  const result = db.prepare(explicitInsertSql).run({
    ...image,
    productId,
    providerMode: image.providerMode || null,
    outputStage: image.outputStage || "output_2",
    outputKind: image.outputKind || "final_ai",
    isMock: image.isMock ? 1 : 0,
    isFinal: image.isFinal === false ? 0 : 1,
    priceLabelReferencePath: image.priceLabelReferencePath || null,
    priceLabelProvider: image.priceLabelProvider || null,
    priceLabelModel: image.priceLabelModel || null,
    priceLabelPrompt: image.priceLabelPrompt || null,
    errorMessage: image.errorMessage || null,
    overlayBrandId: image.overlayBrandId || null,
    overlayBrandTone: image.overlayBrandTone || null,
    overlayResolvedBrandTone: image.overlayResolvedBrandTone || null,
    overlayAlasleeVariant: image.overlayAlasleeVariant || null,
    overlayCtaText: image.overlayCtaText || null,
    overlayLayoutJson: image.overlayLayoutJson || null,
    now,
    completedAt: image.completedAt || now,
    actor: "system",
  });
  return Number(result.lastInsertRowid);
}

const insertSql = `
  INSERT INTO product_instagram_images
    (product_id, role, filename, path, mime_type, size_bytes, width, height,
     created_at, updated_at, created_by, updated_by)
  VALUES
    (@productId, @role, @filename, @path, @mimeType, @sizeBytes, @width, @height,
     @now, @now, @actor, @actor)
`;

const explicitInsertSql = `
  INSERT INTO product_instagram_images
    (product_id, role, filename, path, mime_type, size_bytes, width, height,
     source_generated_image_id, source_role, profile_id, product_sku, product_price,
     local_path, price_label_reference_path, price_label_provider, price_label_model,
     price_label_prompt, provider_mode, output_stage, output_kind, is_mock, is_final,
     status, error_message, completed_at,
     overlay_brand_id, overlay_brand_tone, overlay_resolved_brand_tone,
     overlay_alaslee_variant, overlay_cta_text, overlay_layout_json,
     created_at, updated_at, created_by, updated_by)
  VALUES
    (@productId, @role, @filename, @path, @mimeType, @sizeBytes, @width, @height,
     @sourceGeneratedImageId, @sourceRole, @profileId, @productSku, @productPrice,
     @localPath, @priceLabelReferencePath, @priceLabelProvider, @priceLabelModel,
     @priceLabelPrompt, @providerMode, @outputStage, @outputKind, @isMock, @isFinal,
     @status, @errorMessage, @completedAt,
     @overlayBrandId, @overlayBrandTone, @overlayResolvedBrandTone,
     @overlayAlasleeVariant, @overlayCtaText, @overlayLayoutJson,
     @now, @now, @actor, @actor)
`;
