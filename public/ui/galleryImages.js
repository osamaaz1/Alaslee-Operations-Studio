// Builds renderable gallery records from product metadata.

export function collectRenderableImages(product = {}) {
  return [
    ...typedImages(product.generatedImages, product, "gallery"),
    ...typedImages(product.instagramImages, product, "instagram"),
  ];
}

function typedImages(images = [], product, outputType) {
  return images.map((image) => ({
    ...image,
    outputType,
    productId: product.id,
    batchId: product.sourceBatchId,
    productCode: product.sourceProductCode || product.id,
  }));
}

