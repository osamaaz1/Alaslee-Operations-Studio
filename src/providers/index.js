import { config } from "../config.js";
import { PROVIDERS, normalizeProviderName } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";
import { GeminiProvider } from "./GeminiProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";

const providerFactories = {
  [PROVIDERS.GEMINI]: () =>
    new GeminiProvider({
      apiKey: config.gemini.apiKey,
      model: config.gemini.model,
    }),
  [PROVIDERS.GPT]: () =>
    new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    }),
};

export function createAIProvider(providerName = config.aiProvider) {
  const normalizedProvider = normalizeProviderName(providerName, config.aiProvider);
  const factory = providerFactories[normalizedProvider];
  if (!factory) {
    throw new AppError(`Unsupported AI_PROVIDER "${providerName}". Use "gemini" or "gpt".`, 500);
  }

  return factory();
}

export function listSupportedProviders() {
  return Object.keys(providerFactories);
}
