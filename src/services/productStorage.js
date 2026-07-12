// Resolves on-disk product folders for originals, gallery, and Instagram images.

import path from "node:path";
import { storagePaths } from "../config.js";

export function singleOriginalsDir(productId) {
  return path.join(storagePaths.originalsDir, productId);
}

export function batchProductDirs(batchId, productCode) {
  const productRoot = path.join(storagePaths.productsDir, safeSegment(batchId), safeSegment(productCode));

  return {
    root: productRoot,
    originals: path.join(productRoot, "originals"),
    gallery: path.join(productRoot, "gallery"),
    instagram: path.join(productRoot, "instagram"),
  };
}

export function generatedDirForProduct(product) {
  if (product.source_batch_id && product.source_product_code) {
    return batchProductDirs(product.source_batch_id, product.source_product_code).gallery;
  }

  return path.join(storagePaths.generatedDir, product.id);
}

export function instagramDirForProduct(product) {
  if (product.source_batch_id && product.source_product_code) {
    return batchProductDirs(product.source_batch_id, product.source_product_code).instagram;
  }

  return path.join(storagePaths.generatedDir, product.id, "instagram");
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}
