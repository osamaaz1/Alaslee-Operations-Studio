// Defines supported provider identifiers and validation helpers.

export const PROVIDERS = Object.freeze({
  GEMINI: "gemini",
  GPT: "gpt",
  FREE_TEST: "free-test",
});

export const LEGACY_PROVIDER_ALIASES = Object.freeze({
  openai: PROVIDERS.GPT,
});

export const SUPPORTED_PROVIDERS = Object.freeze([
  PROVIDERS.GEMINI,
  PROVIDERS.GPT,
  PROVIDERS.FREE_TEST,
]);

export function normalizeProviderName(providerName, fallback) {
  const normalized = String(providerName || fallback || "").trim().toLowerCase();
  return LEGACY_PROVIDER_ALIASES[normalized] || normalized;
}

export function isSupportedProvider(providerName) {
  return SUPPORTED_PROVIDERS.includes(providerName);
}

export function isFreeTestProvider(providerName) {
  return normalizeProviderName(providerName) === PROVIDERS.FREE_TEST;
}
