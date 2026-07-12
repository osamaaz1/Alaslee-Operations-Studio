// Validates runtime AI provider selection.

import { config } from "../config.js";
import { isSupportedProvider, normalizeProviderName, SUPPORTED_PROVIDERS } from "../domain/providers.js";
import { AppError } from "./errors.js";

export function requireSupportedProvider(providerName) {
  const provider = normalizeProviderName(providerName, config.aiProvider);
  if (isSupportedProvider(provider)) return provider;

  throw new AppError(`Unsupported provider. Use one of: ${SUPPORTED_PROVIDERS.join(", ")}.`, 400);
}
