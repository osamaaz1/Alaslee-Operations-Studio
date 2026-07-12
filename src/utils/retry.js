const transientStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const transientCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(error) {
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (transientStatusCodes.has(status)) {
    return true;
  }

  return transientCodes.has(error?.code);
}

export async function withProviderRetry(operation, { attempts = 3, baseDelayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransient(error)) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}
