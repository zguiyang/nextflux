const CACHE_VERSION = 1;

const fallbackHash = (value) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fallback-${(hash >>> 0).toString(16)}`;
};

export const hashText = async (value) => {
  const text = String(value ?? "");
  const cryptoApi = globalThis.crypto;
  const TextEncoderApi = globalThis.TextEncoder;

  if (!cryptoApi?.subtle || !TextEncoderApi) {
    return fallbackHash(text);
  }

  const bytes = new TextEncoderApi().encode(text);
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const createBilingualTranslationCacheIdentity = async ({
  articleId,
  sourceContent,
  targetLanguage,
  capability,
}) => {
  const config = {
    providerId: capability?.provider?.id || "",
    baseUrl: capability?.provider?.baseUrl || "",
    modelId: capability?.model?.id || "",
    modelName: capability?.model?.modelId || "",
    promptId: capability?.prompt?.id || "",
    promptContent: capability?.prompt?.content || "",
  };
  const sourceHash = await hashText(sourceContent);
  const configHash = await hashText(JSON.stringify(config));
  const cacheKey = await hashText(
    JSON.stringify({
      version: CACHE_VERSION,
      articleId: String(articleId),
      targetLanguage,
      configHash,
    }),
  );

  return { cacheKey, sourceHash, configHash };
};
