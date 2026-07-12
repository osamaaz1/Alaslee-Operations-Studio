// Persists explicit Instagram generation attempt status and metadata.

import { db } from "../db/database.js";

export function createInstagramAttempt(input) {
  const now = new Date().toISOString();
  const result = db.prepare(insertSql).run({
    ...input,
    localPath: input.localPath || null,
    finalPath: input.finalPath || null,
    priceLabelReferencePath: input.priceLabelReferencePath || null,
    priceLabelProvider: input.priceLabelProvider || null,
    priceLabelModel: input.priceLabelModel || null,
    priceLabelPrompt: input.priceLabelPrompt || null,
    providerMode: input.providerMode || null,
    outputKind: input.outputKind || null,
    isMock: input.isMock ? 1 : 0,
    isFinal: input.isFinal === false ? 0 : 1,
    errorMessage: input.errorMessage || null,
    completedAt: input.completedAt || null,
    now,
  });
  return result.lastInsertRowid;
}

export function updateInstagramAttempt(attemptId, input) {
  db.prepare(updateSql).run({
    status: input.status,
    localPath: input.localPath || null,
    finalPath: input.finalPath || null,
    priceLabelReferencePath: input.priceLabelReferencePath || null,
    priceLabelProvider: input.priceLabelProvider || null,
    priceLabelModel: input.priceLabelModel || null,
    priceLabelPrompt: input.priceLabelPrompt || null,
    providerMode: input.providerMode || null,
    outputKind: input.outputKind || null,
    isMock: input.isMock ? 1 : 0,
    isFinal: input.isFinal === false ? 0 : 1,
    errorMessage: input.errorMessage || null,
    completedAt: input.completedAt || null,
    updatedAt: new Date().toISOString(),
    attemptId,
  });
}

const insertSql = `
  INSERT INTO instagram_generation_attempts
    (product_id, source_generated_image_id, source_role, profile_id, product_sku,
     product_price, local_path, final_path, price_label_reference_path,
     price_label_provider, price_label_model, price_label_prompt,
     provider_mode, output_kind, is_mock, is_final, status,
     error_message, created_at, updated_at, completed_at)
  VALUES
    (@productId, @sourceGeneratedImageId, @sourceRole, @profileId, @productSku,
     @productPrice, @localPath, @finalPath, @priceLabelReferencePath,
     @priceLabelProvider, @priceLabelModel, @priceLabelPrompt,
     @providerMode, @outputKind, @isMock, @isFinal, @status,
     @errorMessage, @now, @now, @completedAt)
`;

const updateSql = `
  UPDATE instagram_generation_attempts
  SET status = @status,
      local_path = @localPath,
      final_path = @finalPath,
      price_label_reference_path = @priceLabelReferencePath,
      price_label_provider = @priceLabelProvider,
      price_label_model = @priceLabelModel,
      price_label_prompt = @priceLabelPrompt,
      provider_mode = @providerMode,
      output_kind = @outputKind,
      is_mock = @isMock,
      is_final = @isFinal,
      error_message = @errorMessage,
      completed_at = @completedAt,
      updated_at = @updatedAt
  WHERE id = @attemptId
`;
