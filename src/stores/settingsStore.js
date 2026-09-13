import { persistentAtom } from "@nanostores/persistent";

export const DEFAULT_MODEL_MAX_OUTPUT_TOKENS = 2048;
export const MIN_MODEL_MAX_OUTPUT_TOKENS = 16;

const defaultAIProvider = {
  id: "default",
  nameKey: "settings.ai.builtinProviders.default.name",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  apiProtocol: "chat",
};

const defaultAIModel = {
  id: "default",
  providerId: defaultAIProvider.id,
  nameKey: "settings.ai.builtinModels.default.name",
  modelId: "gpt-4o-mini",
  maxOutputTokens: DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
};

const defaultAISummaryPrompt = {
  id: "summary-default",
  capability: "summary",
  nameKey: "settings.ai.builtinPrompts.summary.name",
  descriptionKey: "settings.ai.builtinPrompts.summary.description",
  content:
    "You are a helpful assistant that summarizes articles concisely. Provide a clear, structured summary in the same language as the article. Format: just plain text, no markdown.",
};

const defaultAITranslationModel = {
  id: "translation",
  providerId: defaultAIProvider.id,
  nameKey: "settings.ai.builtinModels.translation.name",
  modelId: "gpt-4o-mini",
  maxOutputTokens: DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
};

const defaultAITranslationPrompt = {
  id: "translation-default",
  capability: "translation",
  nameKey: "settings.ai.builtinPrompts.translation.name",
  descriptionKey: "settings.ai.builtinPrompts.translation.description",
  content:
    "You are a professional translator. Translate the given text accurately while preserving meaning and tone. Return only the translation as plain text, without explanations or markdown.",
};

const defaultValue = {
  lineHeight: 1.8,
  fontSize: 16,
  maxWidth: 65, // 单位为ch
  alignJustify: false,
  fontFamily: "system-ui",
  titleFontSize: 1.6, // 标题相对于正文大小的倍数
  titleAlignType: "left",
  feedIconShape: "square", // circle, square
  useGrayIcon: false,
  sortDirection: "desc", // asc, desc
  sortField: "published_at", // published_at, created_at
  showHiddenFeeds: false,
  markAsReadOnScroll: false,
  cardImageSize: "large", // none, small, large
  showFavicon: true,
  titleLines: 2,
  textPreviewLines: 2,
  showReadingTime: true,
  autoHideToolbar: false,
  syncInterval: "15", // 添加同步间隔设置，默认15分钟
  showLineNumbers: false,
  forceDarkCodeTheme: false,
  defaultExpandCategory: false, // 默认展开分类
  showUnreadByDefault: true,
  reduceMotion: false,
  borderRadius: 0.4, // 0-0.5rem
  interfaceFontSize: "16",
  showIndicator: true,
  floatingSidebar: false,
  aiProviders: [defaultAIProvider],
  aiModels: [defaultAIModel, defaultAITranslationModel],
  aiPrompts: [defaultAISummaryPrompt, defaultAITranslationPrompt],
  aiCapabilities: {
    summary: {
      modelId: defaultAIModel.id,
      promptId: defaultAISummaryPrompt.id,
    },
    translation: {
      modelId: defaultAITranslationModel.id,
      promptId: defaultAITranslationPrompt.id,
    },
  },
};

const hasMixedModelCredentials = (models) =>
  Array.isArray(models) &&
  models.some((item) => "apiKey" in item || "baseUrl" in item);

const normalizePositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.max(MIN_MODEL_MAX_OUTPUT_TOKENS, Math.floor(number))
    : fallback;
};

const normalizeAIProvider = (provider) => ({
  ...provider,
  apiProtocol: provider.apiProtocol === "responses" ? "responses" : "chat",
});

const normalizeAIModel = (model) => ({
  ...model,
  maxOutputTokens: normalizePositiveInteger(
    model.maxOutputTokens,
    DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
  ),
});

const migrateFromMixedModels = (storedValue) => {
  const providers = storedValue.aiModels.map((item) => ({
    id: item.id,
    ...(item.name ? { name: item.name } : {}),
    ...(item.nameKey ? { nameKey: item.nameKey } : {}),
    apiKey: item.apiKey ?? "",
    baseUrl: item.baseUrl ?? defaultAIProvider.baseUrl,
    apiProtocol: "chat",
  }));

  const models = storedValue.aiModels.map((item) => ({
    id: item.id,
    providerId: item.id,
    ...(item.name ? { name: item.name } : {}),
    ...(item.nameKey ? { nameKey: item.nameKey } : {}),
    modelId: item.model ?? item.modelId ?? defaultAIModel.modelId,
    maxOutputTokens: normalizePositiveInteger(
      item.maxOutputTokens,
      DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
    ),
  }));

  const prompts = Array.isArray(storedValue.aiPrompts)
    ? storedValue.aiPrompts
    : [defaultAISummaryPrompt];

  const capabilities = storedValue.aiCapabilities?.summary
    ? storedValue.aiCapabilities
    : {
        summary: {
          modelId: models[0]?.id ?? defaultAIModel.id,
          promptId: prompts[0]?.id ?? defaultAISummaryPrompt.id,
        },
      };

  return {
    ...defaultValue,
    ...storedValue,
    aiProviders: providers,
    aiModels: models.map(normalizeAIModel),
    aiPrompts: prompts,
    aiCapabilities: capabilities,
  };
};

const migrateFromLegacyAISettings = (storedValue) => {
  const provider = {
    ...defaultAIProvider,
    apiKey: storedValue.aiApiKey ?? defaultAIProvider.apiKey,
    baseUrl: storedValue.aiBaseUrl ?? defaultAIProvider.baseUrl,
  };
  const model = {
    ...defaultAIModel,
    modelId: storedValue.aiModel ?? defaultAIModel.modelId,
  };
  const prompt = {
    ...defaultAISummaryPrompt,
    content: storedValue.aiPrompt ?? defaultAISummaryPrompt.content,
  };

  return {
    ...defaultValue,
    ...storedValue,
    aiProviders: [provider],
    aiModels: [normalizeAIModel(model)],
    aiPrompts: [prompt],
    aiCapabilities: {
      summary: {
        modelId: model.id,
        promptId: prompt.id,
      },
    },
  };
};

const ensureTranslationCapability = (settings) => {
  const prompts = [...(settings.aiPrompts || [])];
  const models = [...(settings.aiModels || [])];
  const capabilities = { ...(settings.aiCapabilities || {}) };

  if (!prompts.some((item) => item.id === defaultAITranslationPrompt.id)) {
    prompts.push(defaultAITranslationPrompt);
  }

  if (!models.some((item) => item.id === defaultAITranslationModel.id)) {
    models.push(defaultAITranslationModel);
  }

  if (!capabilities.translation) {
    capabilities.translation = {
      modelId: defaultAITranslationModel.id,
      promptId: defaultAITranslationPrompt.id,
    };
  }

  return {
    ...settings,
    aiProviders: (settings.aiProviders || []).map(normalizeAIProvider),
    aiPrompts: prompts,
    aiModels: models.map(normalizeAIModel),
    aiCapabilities: capabilities,
  };
};

export const migrateAISettings = (storedValue) => {
  if (Array.isArray(storedValue.aiProviders)) {
    return ensureTranslationCapability({ ...defaultValue, ...storedValue });
  }

  if (hasMixedModelCredentials(storedValue.aiModels)) {
    return ensureTranslationCapability(migrateFromMixedModels(storedValue));
  }

  if (
    storedValue.aiApiKey !== undefined ||
    storedValue.aiBaseUrl !== undefined ||
    storedValue.aiModel !== undefined ||
    storedValue.aiPrompt !== undefined
  ) {
    return ensureTranslationCapability(
      migrateFromLegacyAISettings(storedValue),
    );
  }

  return ensureTranslationCapability({ ...defaultValue, ...storedValue });
};

export const settingsState = persistentAtom("settings", defaultValue, {
  encode: (value) => {
    const filteredValue = Object.keys(value).reduce((acc, key) => {
      if (key in defaultValue) {
        acc[key] = value[key];
      }
      return acc;
    }, {});
    return JSON.stringify(filteredValue);
  },
  decode: (str) => {
    const storedValue = JSON.parse(str);
    return migrateAISettings(storedValue);
  },
});

export const updateSettings = (settingsChanges) =>
  settingsState.set({ ...settingsState.get(), ...settingsChanges });

export const resolveAICapability = (settings, capability) => {
  const providers = settings.aiProviders || [];
  const models = settings.aiModels || [];
  const prompts = settings.aiPrompts || [];
  const binding = settings.aiCapabilities?.[capability] || {};

  const model =
    models.find((item) => item.id === binding.modelId) || models[0] || null;
  const provider = model
    ? providers.find((item) => item.id === model.providerId) ||
      providers[0] ||
      null
    : null;
  const prompt =
    prompts.find((item) => item.id === binding.promptId) ||
    prompts.find((item) => item.capability === capability) ||
    prompts[0] ||
    null;

  return { provider, model, prompt };
};

export const getAICapability = (capability) =>
  resolveAICapability(settingsState.get(), capability);

export const resetSettings = () => {
  // 定义阅读相关的设置项
  const readingSettings = [
    "lineHeight",
    "fontSize",
    "maxWidth",
    "alignJustify",
    "fontFamily",
    "titleFontSize",
    "titleAlignType",
    "autoHideToolbar",
    "showLineNumbers",
    "forceDarkCodeTheme",
  ];
  const currentSettings = settingsState.get();
  const newSettings = { ...currentSettings };

  // 只重置阅读相关的设置
  readingSettings.forEach((key) => {
    newSettings[key] = defaultValue[key];
  });

  settingsState.set(newSettings);
};
