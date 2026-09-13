import { describe, expect, it } from "vitest";
import {
  migrateAISettings,
  resolveAICapability,
} from "./settingsStore.js";

describe("AI settings", () => {
  it("migrates legacy top-level AI settings", () => {
    const settings = migrateAISettings({
      aiApiKey: "legacy-key",
      aiBaseUrl: "https://example.com/v1",
      aiModel: "legacy-model",
      aiPrompt: "legacy prompt",
    });

    expect(settings.aiProviders[0]).toMatchObject({
      id: "default",
      apiKey: "legacy-key",
      baseUrl: "https://example.com/v1",
    });
    expect(settings.aiModels[0]).toMatchObject({
      id: "default",
      providerId: "default",
      modelId: "legacy-model",
    });
    expect(settings.aiPrompts[0]).toMatchObject({
      id: "summary-default",
      content: "legacy prompt",
    });
    expect(settings.aiCapabilities.summary).toEqual({
      modelId: "default",
      promptId: "summary-default",
    });
  });

  it("migrates intermediate mixed model credentials into providers and models", () => {
    const settings = migrateAISettings({
      aiModels: [
        {
          id: "default",
          name: "Default",
          apiKey: "mixed-key",
          baseUrl: "https://mixed.example.com/v1",
          model: "mixed-model",
        },
      ],
      aiPrompts: [
        {
          id: "summary-default",
          capability: "summary",
          name: "Article summary",
          content: "mixed prompt",
        },
      ],
      aiCapabilities: {
        summary: { modelId: "default", promptId: "summary-default" },
      },
    });

    expect(settings.aiProviders[0]).toMatchObject({
      id: "default",
      name: "Default",
      apiKey: "mixed-key",
      baseUrl: "https://mixed.example.com/v1",
    });
    expect(settings.aiModels[0]).toMatchObject({
      id: "default",
      providerId: "default",
      name: "Default",
      modelId: "mixed-model",
    });
    expect(settings.aiCapabilities.summary).toEqual({
      modelId: "default",
      promptId: "summary-default",
    });
  });

  it("resolves the second provider when summary binds to the second model", () => {
    const settings = {
      aiProviders: [
        { id: "openai", apiKey: "key-1", baseUrl: "https://api.openai.com/v1" },
        {
          id: "deepseek",
          apiKey: "key-2",
          baseUrl: "https://api.deepseek.com/v1",
        },
      ],
      aiModels: [
        { id: "fast", providerId: "openai", modelId: "gpt-4o-mini" },
        {
          id: "reasoning",
          providerId: "deepseek",
          modelId: "deepseek-reasoner",
        },
      ],
      aiPrompts: [
        { id: "summary", capability: "summary", content: "Summarize" },
      ],
      aiCapabilities: {
        summary: { modelId: "reasoning", promptId: "summary" },
      },
    };

    expect(resolveAICapability(settings, "summary")).toEqual({
      provider: {
        id: "deepseek",
        apiKey: "key-2",
        baseUrl: "https://api.deepseek.com/v1",
      },
      model: {
        id: "reasoning",
        providerId: "deepseek",
        modelId: "deepseek-reasoner",
      },
      prompt: { id: "summary", capability: "summary", content: "Summarize" },
    });
  });

  it("resolves provider, model, and prompt bound to a capability", () => {
    const settings = {
      aiProviders: [
        { id: "openai", apiKey: "provider-key", baseUrl: "https://api.openai.com/v1" },
      ],
      aiModels: [
        { id: "fast", providerId: "openai", modelId: "fast-model" },
        { id: "quality", providerId: "openai", modelId: "quality-model" },
      ],
      aiPrompts: [
        { id: "summary", capability: "summary", content: "Summarize" },
        { id: "translation", capability: "translation", content: "Translate" },
      ],
      aiCapabilities: {
        summary: { modelId: "fast", promptId: "summary" },
        translation: { modelId: "quality", promptId: "translation" },
      },
    };

    expect(resolveAICapability(settings, "summary")).toEqual({
      provider: {
        id: "openai",
        apiKey: "provider-key",
        baseUrl: "https://api.openai.com/v1",
      },
      model: { id: "fast", providerId: "openai", modelId: "fast-model" },
      prompt: { id: "summary", capability: "summary", content: "Summarize" },
    });
  });
});
