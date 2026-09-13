import { fetchAIModels } from "@/api/openai.js";
import { resolveAICapability } from "@/stores/settingsStore.js";

export const SUMMARY_CAPABILITY = "summary";
export const TRANSLATION_CAPABILITY = "translation";

export function getSummaryBoundSelections(settings) {
  const summaryBinding = settings.aiCapabilities?.summary || {};
  const aiModels = settings.aiModels || [];
  const aiProviders = settings.aiProviders || [];

  const activeModel =
    aiModels.find((item) => item.id === summaryBinding.modelId) ||
    aiModels[0] ||
    null;
  const activeProvider = activeModel
    ? aiProviders.find((item) => item.id === activeModel.providerId) ||
      aiProviders[0] ||
      null
    : aiProviders[0] || null;

  return { activeModel, activeProvider, summaryBinding };
}

export function getPrimaryProvider(settings) {
  return getSummaryBoundSelections(settings).activeProvider;
}

export function getUnsavedProviderCredentials(localApiKey, localBaseUrl) {
  return {
    apiKey: localApiKey.trim(),
    baseUrl: localBaseUrl.trim(),
  };
}

export function getCapabilityCardState(settings, capability) {
  const { model, prompt } = resolveAICapability(settings, capability);
  return {
    modelId: model?.modelId || "",
    promptContent: prompt?.content || "",
  };
}

export function getLocalizedName(item, t) {
  if (item?.nameKey) return t(item.nameKey);
  if (item?.name) return item.name;
  return "";
}

export function getCapabilityCardTitle(capability, modelId, t) {
  const name = t(`settings.ai.capabilityCards.${capability}.name`);
  const modelLabel = modelId?.trim() || t("settings.ai.modelUnset");
  return `${name} · ${modelLabel}`;
}

export function buildCapabilitySaveUpdates(
  settings,
  { apiKey, baseUrl, capabilities },
) {
  const { activeProvider } = getSummaryBoundSelections(settings);
  const providerId = activeProvider?.id || settings.aiProviders?.[0]?.id;

  const updatedProviders = (settings.aiProviders || []).map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        }
      : provider,
  );

  const capabilityUpdates = capabilities || {};

  const updatedModels = (settings.aiModels || []).map((model) => {
    for (const [capability, card] of Object.entries(capabilityUpdates)) {
      const binding = settings.aiCapabilities?.[capability];
      if (binding?.modelId === model.id && card?.modelId !== undefined) {
        return {
          ...model,
          modelId: card.modelId.trim(),
          providerId,
        };
      }
    }
    return model;
  });

  const updatedPrompts = (settings.aiPrompts || []).map((prompt) => {
    for (const [capability, card] of Object.entries(capabilityUpdates)) {
      const binding = settings.aiCapabilities?.[capability];
      if (
        binding?.promptId === prompt.id &&
        card?.promptContent !== undefined
      ) {
        return { ...prompt, content: card.promptContent };
      }
    }
    return prompt;
  });

  return {
    aiProviders: updatedProviders,
    aiModels: updatedModels,
    aiPrompts: updatedPrompts,
  };
}

export async function fetchModelsForService(credentials, previousModels = []) {
  try {
    const models = await fetchAIModels(credentials);
    if (!models.length) {
      return { models: previousModels, status: "empty" };
    }
    return { models, status: "success" };
  } catch {
    return { models: previousModels, status: "failed" };
  }
}
