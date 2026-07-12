// Composes an Instagram image using the exact settings shared by debug preview and production.

import sharp from "sharp";

const nearWhiteBackground = Object.freeze({
  minimumDarkChannel: 210,
  maximumSaturation: 34,
  fadeStart: 250,
  fadeRange: 40,
});

export async function composeInstagramImage(input, assets, settings, dimensions, options = {}) {
  const { width, height } = dimensions;
  const [footer, logo, preparedProduct, background] = await Promise.all([
    footerOverlay(assets.footer, width, height, settings),
    logoOverlay(assets.logo, width, settings),
    productOverlay(input, width, settings),
    backgroundCanvas(assets.background, width, height, settings),
  ]);
  const footerTop =
    height -
    footer.height -
    Math.round(height * (settings.footerBottomMarginPercent / 100));
  const product = await constrainProductHeight(preparedProduct, footerTop);
  const shadow = settings.shadowEnabled ? await productShadow(product, width, settings) : null;
  const productTop = productPosition(footerTop, product.height, settings.productOffsetYPercent, height);
  const productLeft = Math.round((width - product.width) / 2);
  const footerLeft =
    Math.round((width - footer.width) / 2) + Math.round(width * (settings.footerOffsetXPercent / 100));
  const layers = [
    shadow && {
      input: shadow.buffer,
      left: productLeft + Math.round(width * (settings.shadowOffsetXPercent / 100)),
      top: productTop + Math.round(height * (settings.shadowOffsetYPercent / 100)),
    },
    { input: product.buffer, left: productLeft, top: productTop },
    { input: footer.buffer, left: footerLeft, top: footerTop },
    { input: logo.buffer, ...logoPosition(width, height, logo, footerTop, settings) },
  ].filter(Boolean);

  const result = await sharp(background)
    .composite(layers)
    .png({
      compressionLevel: options.compressionLevel ?? 9,
      adaptiveFiltering: options.adaptiveFiltering ?? true,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}

async function backgroundCanvas(assetPath, width, height, settings) {
  const zoom = settings.backgroundZoomPercent / 100;
  const zoomedWidth = Math.round(width * zoom);
  const zoomedHeight = Math.round(height * zoom);
  const zoomed = await sharp(assetPath, { failOn: "error" })
    .resize(zoomedWidth, zoomedHeight, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  if (zoomedWidth === width && zoomedHeight === height) return zoomed;

  const maximumLeft = zoomedWidth - width;
  const maximumTop = zoomedHeight - height;
  const left = clampedPosition(
    maximumLeft / 2 + width * (settings.backgroundOffsetXPercent / 100),
    maximumLeft,
  );
  const top = clampedPosition(
    maximumTop / 2 + height * (settings.backgroundOffsetYPercent / 100),
    maximumTop,
  );

  return sharp(zoomed)
    .extract({
      left,
      top,
      width,
      height,
    })
    .png()
    .toBuffer();
}

async function productShadow(product, canvasWidth, settings) {
  let alphaPipeline = sharp(product.buffer, { failOn: "error" }).extractChannel("alpha");
  const blurPixels = canvasWidth * (settings.shadowBlurPercent / 100);
  if (blurPixels >= 0.3) {
    alphaPipeline = alphaPipeline.blur(blurPixels);
  }

  const alpha = await alphaPipeline
    .linear(settings.shadowOpacityPercent / 100)
    .raw()
    .toBuffer();
  const buffer = await sharp({
    create: {
      width: product.width,
      height: product.height,
      channels: 3,
      background: { r: 12, g: 24, b: 21 },
    },
  })
    .joinChannel(alpha, {
      raw: { width: product.width, height: product.height, channels: 1 },
    })
    .png()
    .toBuffer();

  return { buffer };
}

async function productOverlay(input, canvasWidth, settings) {
  const size = Math.round(canvasWidth * (settings.productWidthPercent / 100));
  const raw = await sharp(input, { failOn: "error" })
    .resize(size, size, { fit: "contain" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  removeNearWhiteBackground(raw.data);

  const squareBuffer = await sharp(raw.data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  const trimmed = await sharp(squareBuffer)
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 8,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return { buffer: trimmed.data, width: trimmed.info.width, height: trimmed.info.height };
}

async function constrainProductHeight(product, maximumHeight) {
  if (product.height <= maximumHeight) return product;

  const resized = await sharp(product.buffer)
    .resize({ height: Math.max(1, maximumHeight), fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });

  return { buffer: resized.data, width: resized.info.width, height: resized.info.height };
}

function removeNearWhiteBackground(pixels) {
  const thresholds = nearWhiteBackground;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const existingAlpha = pixels[index + 3];
    const darkestChannel = Math.min(red, green, blue);
    const lightestChannel = Math.max(red, green, blue);
    const saturation = lightestChannel - darkestChannel;

    if (darkestChannel < thresholds.minimumDarkChannel || saturation > thresholds.maximumSaturation) continue;

    const foregroundFactor = Math.max(0, Math.min(1, (thresholds.fadeStart - darkestChannel) / thresholds.fadeRange));
    pixels[index + 3] = Math.round(existingAlpha * foregroundFactor);
  }
}

async function footerOverlay(assetPath, width, height, settings) {
  const footerWidth = Math.round(width * (settings.footerWidthPercent / 100));
  const maximumHeight = Math.round(height * (settings.footerMaxHeightPercent / 100));
  const trimmedAsset = await trimTransparentPadding(assetPath);
  const footer = await sharp(trimmedAsset, { failOn: "error" })
    .resize({ width: footerWidth, height: maximumHeight, fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: await applyOpacity(footer.data, settings.footerOpacityPercent),
    width: footer.info.width,
    height: footer.info.height,
  };
}

async function logoOverlay(assetPath, width, settings) {
  const trimmedAsset = await trimTransparentPadding(assetPath);
  const logo = await sharp(trimmedAsset, { failOn: "error" })
    .resize({ width: Math.round(width * (settings.logoWidthPercent / 100)), withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: await applyOpacity(logo.data, settings.logoOpacityPercent),
    width: logo.info.width,
    height: logo.info.height,
  };
}

async function trimTransparentPadding(assetPath) {
  return sharp(assetPath, { failOn: "error" })
    .ensureAlpha()
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 8,
    })
    .png()
    .toBuffer();
}

function productPosition(availableHeight, productHeight, offsetPercent, canvasHeight) {
  const centered = Math.round((availableHeight - productHeight) / 2);
  const offset = Math.round(canvasHeight * (offsetPercent / 100));
  return Math.max(0, Math.min(availableHeight - productHeight, centered + offset));
}

function logoPosition(width, height, logo, footerTop, settings) {
  const margin = Math.round(width * (settings.logoMarginPercent / 100));
  const isLeft = settings.logoCorner.endsWith("left");
  const isTop = settings.logoCorner.startsWith("top");
  const left = isLeft ? margin : width - logo.width - margin;
  const top = isTop ? margin : Math.max(margin, footerTop - logo.height - margin);
  return {
    left: left + Math.round(width * (settings.logoOffsetXPercent / 100)),
    top: top + Math.round(height * (settings.logoOffsetYPercent / 100)),
  };
}

async function applyOpacity(buffer, opacityPercent) {
  if (opacityPercent >= 100) return buffer;

  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const factor = opacityPercent / 100;
  for (let index = 3; index < raw.data.length; index += 4) {
    raw.data[index] = Math.round(raw.data[index] * factor);
  }

  return sharp(raw.data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

function clampedPosition(value, maximum) {
  return Math.round(Math.max(0, Math.min(maximum, value)));
}
