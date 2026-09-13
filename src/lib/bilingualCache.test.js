import { describe, expect, it } from "vitest";
import { createBilingualTranslationCacheIdentity } from "./bilingualCache.js";

const capability = {
  provider: { id: "provider-1", baseUrl: "https://example.com/v1" },
  model: { id: "model-1", modelId: "translation-model" },
  prompt: {
    id: "prompt-1",
    content: "Translate accurately.",
  },
};

describe("bilingualCache", () => {
  it("creates a stable identity for the same article and configuration", async () => {
    const first = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello</p>",
      targetLanguage: "zh-CN",
      capability,
    });
    const second = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello</p>",
      targetLanguage: "zh-CN",
      capability,
    });

    expect(second).toEqual(first);
  });

  it("invalidates the cache when source or translation settings change", async () => {
    const base = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello</p>",
      targetLanguage: "zh-CN",
      capability,
    });
    const changedSource = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello again</p>",
      targetLanguage: "zh-CN",
      capability,
    });
    const changedLanguage = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello</p>",
      targetLanguage: "fr-FR",
      capability,
    });
    const changedPrompt = await createBilingualTranslationCacheIdentity({
      articleId: 1,
      sourceContent: "<p>Hello</p>",
      targetLanguage: "zh-CN",
      capability: {
        ...capability,
        prompt: { ...capability.prompt, content: "Translate naturally." },
      },
    });

    expect(changedSource.cacheKey).toBe(base.cacheKey);
    expect(changedSource.sourceHash).not.toBe(base.sourceHash);
    expect(changedLanguage.cacheKey).not.toBe(base.cacheKey);
    expect(changedPrompt.cacheKey).not.toBe(base.cacheKey);
  });
});
