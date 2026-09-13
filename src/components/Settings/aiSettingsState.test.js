import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  SUMMARY_CAPABILITY,
  TRANSLATION_CAPABILITY,
  buildCapabilitySaveUpdates,
  fetchModelsForService,
  getCapabilityCardState,
  getCapabilityCardTitle,
  getLocalizedName,
  getSummaryBoundSelections,
  getUnsavedProviderCredentials,
} from "./aiSettingsState.js";
import { fetchAIModels } from "@/api/openai.js";
import { resolveAICapability } from "@/stores/settingsStore.js";

vi.mock("@/api/openai.js", () => ({
  fetchAIModels: vi.fn(),
}));

describe("AI settings editor state", () => {
  const baseSettings = {
    aiProviders: [
      {
        id: "default",
        apiKey: "saved-key",
        baseUrl: "https://api.openai.com/v1",
      },
    ],
    aiModels: [
      {
        id: "default",
        providerId: "default",
        modelId: "gpt-4o-mini",
      },
      {
        id: "translation",
        providerId: "default",
        modelId: "gpt-4o-mini",
      },
    ],
    aiPrompts: [
      {
        id: "summary-default",
        capability: "summary",
        nameKey: "settings.ai.builtinPrompts.summary.name",
        content: "Summarize in plain text",
      },
      {
        id: "translation-default",
        capability: "translation",
        nameKey: "settings.ai.builtinPrompts.translation.name",
        content: "Translate in plain text",
      },
    ],
    aiCapabilities: {
      summary: { modelId: "default", promptId: "summary-default" },
      translation: { modelId: "translation", promptId: "translation-default" },
    },
  };

  beforeEach(() => {
    vi.mocked(fetchAIModels).mockReset();
  });

  const multiProviderSettings = {
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
    aiPrompts: [{ id: "summary", capability: "summary", content: "Summarize" }],
    aiCapabilities: {
      summary: { modelId: "reasoning", promptId: "summary" },
    },
  };

  it("resolves the second provider when summary binds to the second model", () => {
    expect(getSummaryBoundSelections(multiProviderSettings)).toEqual({
      activeModel: {
        id: "reasoning",
        providerId: "deepseek",
        modelId: "deepseek-reasoner",
      },
      activeProvider: {
        id: "deepseek",
        apiKey: "key-2",
        baseUrl: "https://api.deepseek.com/v1",
      },
      summaryBinding: { modelId: "reasoning", promptId: "summary" },
    });

    expect(resolveAICapability(multiProviderSettings, "summary")).toEqual({
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

  it("uses unsaved provider form values for fetch and test requests", () => {
    const savedProvider = {
      apiKey: "saved-key",
      baseUrl: "https://saved.example/v1",
    };

    expect(
      getUnsavedProviderCredentials(
        " edited-key ",
        " https://edited.example/v1/ ",
      ),
    ).toEqual({
      apiKey: "edited-key",
      baseUrl: "https://edited.example/v1/",
    });
    expect(
      getUnsavedProviderCredentials("edited-key", "https://edited.example/v1")
        .apiKey,
    ).not.toBe(savedProvider.apiKey);
  });

  it("keeps the previous model list when /models fetch fails", async () => {
    vi.mocked(fetchAIModels).mockRejectedValue(new Error("network error"));

    await expect(
      fetchModelsForService(
        { apiKey: "key", baseUrl: "https://example.com/v1" },
        ["gpt-4o-mini"],
      ),
    ).resolves.toEqual({
      models: ["gpt-4o-mini"],
      status: "failed",
    });
  });

  it("maps capability card edits onto persisted provider, model, and prompt", () => {
    const updates = buildCapabilitySaveUpdates(baseSettings, {
      apiKey: "new-key",
      baseUrl: "https://new.example/v1",
      capabilities: {
        [SUMMARY_CAPABILITY]: {
          modelId: "gpt-4o",
          promptContent: "New prompt content",
        },
      },
    });

    expect(updates.aiProviders[0]).toMatchObject({
      apiKey: "new-key",
      baseUrl: "https://new.example/v1",
    });
    expect(updates.aiModels[0]).toMatchObject({
      id: "default",
      providerId: "default",
      modelId: "gpt-4o",
    });
    expect(updates.aiPrompts[0]).toMatchObject({
      id: "summary-default",
      content: "New prompt content",
    });
    expect(getCapabilityCardState(
      { ...baseSettings, ...updates },
      SUMMARY_CAPABILITY,
    )).toEqual({
      modelId: "gpt-4o",
      promptContent: "New prompt content",
    });
  });

  it("localizes builtin names via i18n keys without translating prompt content", () => {
    const prompt = baseSettings.aiPrompts[0];
    const t = vi.fn((key) => {
      if (key === "settings.ai.builtinPrompts.summary.name") {
        return "文章总结";
      }
      return key;
    });

    expect(getLocalizedName(prompt, t)).toBe("文章总结");
    expect(t).toHaveBeenCalledWith("settings.ai.builtinPrompts.summary.name");
    expect(t).not.toHaveBeenCalledWith(prompt.content);

    const titleT = vi.fn((key) => {
      if (key === "settings.ai.capabilityCards.summary.name") return "文章总结";
      if (key === "settings.ai.modelUnset") return "未设置";
      return key;
    });
    expect(getCapabilityCardTitle(SUMMARY_CAPABILITY, "", titleT)).toBe(
      "文章总结 · 未设置",
    );
    expect(titleT).not.toHaveBeenCalledWith(prompt.content);
  });

  it("maps translation capability edits without rewriting prompt content", () => {
    const updates = buildCapabilitySaveUpdates(baseSettings, {
      apiKey: "new-key",
      baseUrl: "https://new.example/v1",
      capabilities: {
        [TRANSLATION_CAPABILITY]: {
          modelId: "gpt-4.1",
          promptContent: "用户自定义提示词，保持原样",
        },
      },
    });

    expect(updates.aiPrompts[1]).toMatchObject({
      id: "translation-default",
      content: "用户自定义提示词，保持原样",
    });
    expect(updates.aiModels[1]).toMatchObject({
      id: "translation",
      modelId: "gpt-4.1",
    });
    expect(getCapabilityCardState(
      { ...baseSettings, ...updates },
      TRANSLATION_CAPABILITY,
    )).toEqual({
      modelId: "gpt-4.1",
      promptContent: "用户自定义提示词，保持原样",
    });
  });
});
