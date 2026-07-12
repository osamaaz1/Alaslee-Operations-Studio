// Imports product images from a local batch folder into persisted products.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { PRODUCT_STATUSES, INPUT_MODES } from "../domain/statuses.js";
import { validateUploadedImage } from "../utils/imageValidation.js";
import { AppError } from "../utils/errors.js";
import { writeFileEnsured } from "../utils/files.js";
import { resolveAllowedDirectory } from "../utils/pathSecurity.js";
import { requireSupportedProvider } from "../utils/providerValidation.js";
import { batchProductDirs } from "./productStorage.js";
import { scanBatchFolder } from "./batchFolderScanner.js";
import { insertProductWithOriginals } from "./productWriter.js";
import { insertBatch, getBatchById, listBatchProducts } from "./batchRepository.js";

export async function importBatchFromFolder(input) {
  const provider = requireSupportedProvider(input?.provider);
  const folderPath = await resolveAllowedDirectory(input?.folderPath, config.allowedImportRoots);
  const batchId = crypto.randomUUID();
  const actor = input?.actor || "system";
  const scan = await scanBatchFolder(folderPath);
  const prepared = await prepareProducts(scan.products, batchId, folderPath);

  if (prepared.products.length === 0) {
    throw new AppError("No complete products were found in the selected folder.", 400, prepared.skippedProducts);
  }

  insertBatch({
    id: batchId,
    sourceFolder: folderPath,
    provider,
    brandingEnabled: input?.brandingEnabled === true,
    totalProducts: prepared.products.length,
    actor,
  });

  persistPreparedProducts(prepared.products, provider, input?.brandingEnabled === true, actor);

  return serializeBatchImport(batchId, scan.skippedFiles, prepared.skippedProducts);
}

async function prepareProducts(groups, batchId, folderPath) {
  const products = [];
  const skippedProducts = [];

  for (const group of groups) {
    const reason = skipReason(group);
    if (reason) {
      skippedProducts.push({ productCode: group.productCode, reason });
      continue;
    }

    products.push(await prepareProduct(group, batchId, folderPath));
  }

  return { products, skippedProducts };
}

async function prepareProduct(group, batchId, folderPath) {
  const productId = crypto.randomUUID();
  const dirs = batchProductDirs(batchId, group.productCode);

  return {
    id: productId,
    batchId,
    productCode: group.productCode,
    sourceFolder: folderPath,
    originals: await copyOriginals(group.files, dirs.originals),
  };
}

async function copyOriginals(files, originalsDir) {
  const originals = [];

  for (const file of files) {
    const buffer = await fs.readFile(file.path);
    const stats = await fs.stat(file.path);
    const image = await validateUploadedImage(toUploadFile(file, buffer, stats), file.role, config.maxImageBytes);
    const outputPath = path.join(originalsDir, file.filename);
    await writeFileEnsured(outputPath, image.buffer);
    originals.push({ ...image, filename: file.filename, path: outputPath });
  }

  return originals;
}

function persistPreparedProducts(products, provider, brandingEnabled, actor) {
  for (const product of products) {
    insertProductWithOriginals({
      product: productRecord(product, provider, brandingEnabled, actor),
      originals: product.originals,
    });
  }
}

function productRecord(product, provider, brandingEnabled, actor) {
  return {
    id: product.id,
    status: PRODUCT_STATUSES.QUEUED,
    provider,
    sourceProductCode: product.productCode,
    sourceBatchId: product.batchId,
    sourceFolder: product.sourceFolder,
    inputMode: INPUT_MODES.BATCH_FOLDER,
    brandingEnabled,
    now: new Date().toISOString(),
    actor,
  };
}

function skipReason(group) {
  if (!group.isComplete) return "Missing one or more required images: front, side, angle.";
  if (group.hasDuplicateRoles) return "Duplicate role detected for this product.";
  return undefined;
}

function toUploadFile(file, buffer, stats) {
  return {
    originalname: file.filename,
    buffer,
    size: stats.size,
  };
}

function serializeBatchImport(batchId, skippedFiles, skippedProducts) {
  return {
    batch: getBatchById(batchId),
    products: listBatchProducts(batchId),
    skippedFiles,
    skippedProducts,
  };
}
