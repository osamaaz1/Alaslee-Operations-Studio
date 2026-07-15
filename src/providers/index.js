import { config } from "../config.js";
import { PROVIDERS, normalizeProviderName } from "../domain/providers.js";
import { AppError } from "../utils/errors.js";
import { GeminiProvider } from "./GeminiProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";

const providerFactories = {
  [PROVIDERS.GEMINI]: () =>
    new GeminiProvider({
      apiKey: config.gemini.apiKey,
      apiMode: config.gemini.apiMode,
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
  if (normalizedProvider === PROVIDERS.GEMINI && !config.gemini.apiKey) {
    throw new AppError("ما لقينا مفتاح Gemini على هذا الجهاز، لذلك ما نقدر نبدأ التوليد منه.", 422, {
      code: "provider_credentials_missing", provider: PROVIDERS.GEMINI,
      suggestedProvider: config.openai.apiKey ? PROVIDERS.GPT : null,
    });
  }
  if (normalizedProvider === PROVIDERS.GPT && !config.openai.apiKey) {
    throw new AppError("ما لقينا مفتاح GPT على هذا الجهاز. اطلب من المسؤول إضافة مفتاح OpenAI صالح.", 422, {
      code: "provider_credentials_missing", provider: PROVIDERS.GPT, suggestedProvider: null,
    });
  }
  const factory = providerFactories[normalizedProvider];
  if (!factory) {
    throw new AppError(`Unsupported AI_PROVIDER "${providerName}". Use "gemini" or "gpt".`, 500);
  }

  return factory();
}

export function listSupportedProviders() {
  return Object.keys(providerFactories);
}
