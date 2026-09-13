import { generateText, Output, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getAICapability } from "@/stores/settingsStore.js";
import {
  getTargetLanguageInstruction,
  getTargetLanguageName,
  normalizeAppLocale,
} from "@/lib/bilingualLanguage.js";

const normalizeBaseUrl = (baseUrl) => baseUrl.trim().replace(/\/+$/, "");
export const DEFAULT_COMPLETION_MAX_TOKENS = 2048;
export const CONNECTION_TEST_MAX_TOKENS = 16;
const DEFAULT_REASONING_EFFORT = "none";
const ENABLED_REASONING_EFFORT = "medium";

const normalizeAPIProtocol = (apiProtocol) =>
  apiProtocol === "responses" ? "responses" : "chat";

const isDeepSeekBaseUrl = (baseUrl) => {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "deepseek.com" || hostname.endsWith(".deepseek.com");
  } catch {
    return false;
  }
};

const createCompatibilityFetch = (baseUrl, enableReasoning) => {
  if (!isDeepSeekBaseUrl(baseUrl)) return undefined;

  return async (input, init = {}) => {
    const url = String(input);
    if (!url.endsWith("/chat/completions") || typeof init.body !== "string") {
      if (!url.endsWith("/responses") || typeof init.body !== "string") {
        return fetch(input, init);
      }
    }

    try {
      const body = JSON.parse(init.body);
      if (url.endsWith("/chat/completions")) {
        body.thinking = { type: enableReasoning ? "enabled" : "disabled" };
        body.reasoning_effort = enableReasoning ? "high" : "none";
      } else if (url.endsWith("/responses")) {
        body.reasoning = { effort: enableReasoning ? "high" : "none" };
      }
      return fetch(input, { ...init, body: JSON.stringify(body) });
    } catch {
      return fetch(input, init);
    }
  };
};

const isLikelyReasoningModel = (modelId) =>
  /^(?:o\d|gpt-(?:5|6)(?:[.-]|$))/i.test(modelId) ||
  /(?:reason|think|thinking|reasoner|deepseek|(?:^|[-_.])r1(?:[-_.]|$))/i.test(
    modelId,
  );

const getReasoningProviderOptions = (
  enableReasoning,
  isDeepSeek,
  protocol,
  modelId,
) => {
  if (!enableReasoning && !isDeepSeek && !isLikelyReasoningModel(modelId)) {
    return undefined;
  }

  return {
    openai: {
      reasoningEffort: enableReasoning
        ? ENABLED_REASONING_EFFORT
        : DEFAULT_REASONING_EFFORT,
      ...(isDeepSeek && protocol === "responses"
        ? { forceReasoning: true }
        : {}),
    },
  };
};

const getAPIError = async (response) => {
  const error = await response.json().catch(() => ({}));
  return new Error(
    error?.error?.message || error?.message || `API error: ${response.status}`,
  );
};

const getEffectiveMaxOutputTokens = (model, requested) => {
  const candidate = Number(requested ?? model?.maxOutputTokens);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_COMPLETION_MAX_TOKENS;
  }
  return Math.max(CONNECTION_TEST_MAX_TOKENS, Math.floor(candidate));
};

const getPlainText = (html) => {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.innerText.replace(/\s+/g, " ").trim();
  } catch {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
};

const createThinkFilter = (onChunk) => {
  let inThinking = false;
  let pending = "";

  const safeLength = (text, tag) => {
    for (let index = Math.min(tag.length - 1, text.length); index > 0; index--) {
      if (tag.startsWith(text.slice(text.length - index))) {
        return text.length - index;
      }
    }
    return text.length;
  };

  return (delta) => {
    pending += delta;
    while (pending) {
      if (inThinking) {
        const closeIndex = pending.indexOf("</think>");
        if (closeIndex >= 0) {
          inThinking = false;
          pending = pending.slice(closeIndex + 8).replace(/^\s+/, "");
        } else {
          pending = pending.slice(safeLength(pending, "</think>"));
          break;
        }
      } else {
        const openIndex = pending.indexOf("<think>");
        if (openIndex >= 0) {
          if (openIndex > 0) onChunk(pending.slice(0, openIndex));
          inThinking = true;
          pending = pending.slice(openIndex + 7);
        } else {
          const safe = safeLength(pending, "<think>");
          if (safe > 0) {
            onChunk(pending.slice(0, safe));
            pending = pending.slice(safe);
          }
          break;
        }
      }
    }
  };
};

const resolveCapability = (capability) => {
  const { provider, model, prompt, enableReasoning } = getAICapability(capability);
  const apiKey = provider?.apiKey?.trim();
  const baseUrl = provider?.baseUrl?.trim();
  const modelId = model?.modelId?.trim();

  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");
  if (!modelId) throw new Error("AI model not configured");

  const protocol = normalizeAPIProtocol(provider?.apiProtocol);
  const providerClient = createOpenAI({
    apiKey,
    baseURL: normalizeBaseUrl(baseUrl),
    fetch: createCompatibilityFetch(baseUrl, enableReasoning === true),
  });

  return {
    model: protocol === "responses"
      ? providerClient.responses(modelId)
      : providerClient.chat(modelId),
    modelConfig: model,
    prompt: prompt?.content || "",
    protocol,
    enableReasoning: enableReasoning === true,
    isDeepSeek: isDeepSeekBaseUrl(baseUrl),
  };
};

const buildSystemPrompt = (prompt, extraSystemMessages = []) =>
  [prompt, ...extraSystemMessages].filter(Boolean).join("\n\n");

const buildGenerationOptions = (
  capability,
  messages,
  options = {},
) => {
  const resolved = resolveCapability(capability);
  const maxOutputTokens = getEffectiveMaxOutputTokens(
    resolved.modelConfig,
    options.max_tokens,
  );
  const providerOptions = getReasoningProviderOptions(
    resolved.enableReasoning,
    resolved.isDeepSeek,
    resolved.protocol,
    resolved.modelConfig?.modelId,
  );

  return {
    model: resolved.model,
    system: buildSystemPrompt(resolved.prompt, options.extraSystemMessages),
    messages,
    maxOutputTokens,
    temperature: options.temperature ?? 0.3,
    abortSignal: options.signal,
    ...(providerOptions ? { providerOptions } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.stopWhen ? { stopWhen: options.stopWhen } : {}),
  };
};

export const fetchAIModels = async ({ apiKey, baseUrl }) => {
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) throw await getAPIError(response);

  const payload = await response.json();
  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
  const normalizedModels = models
    .map((model) => {
      if (typeof model === "string") return { id: model };
      if (!model?.id) return null;
      const maxOutputTokens = Number(
        model.max_output_tokens ??
          model.max_completion_tokens ??
          model.maxOutputTokens,
      );
      return {
        id: model.id,
        ...(Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
          ? { maxOutputTokens: Math.max(16, Math.floor(maxOutputTokens)) }
          : {}),
      };
    })
    .filter(Boolean);

  return Array.from(
    new Map(normalizedModels.map((model) => [model.id, model])).values(),
  ).sort((a, b) => a.id.localeCompare(b.id));
};

export const testAIConnection = async ({
  apiKey,
  baseUrl,
  model,
  apiProtocol,
  enableReasoning = false,
}) => {
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");
  if (!model?.trim()) throw new Error("AI model not configured");

  const provider = createOpenAI({
    apiKey: apiKey.trim(),
    baseURL: normalizeBaseUrl(baseUrl),
    fetch: createCompatibilityFetch(baseUrl, enableReasoning === true),
  });
  const protocol = normalizeAPIProtocol(apiProtocol);
  const providerOptions = getReasoningProviderOptions(
    enableReasoning === true,
    isDeepSeekBaseUrl(baseUrl),
    protocol,
    model.trim(),
  );
  const languageModel =
    protocol === "responses"
      ? provider.responses(model.trim())
      : provider.chat(model.trim());

  await generateText({
    model: languageModel,
    prompt: "Reply with OK.",
    maxOutputTokens: CONNECTION_TEST_MAX_TOKENS,
    ...(providerOptions ? { providerOptions } : {}),
  });
};

export const parseTranslationPrecheckResponse = (raw) => {
  if (!raw || typeof raw !== "string") return { valid: false };

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { valid: false };

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed.shouldTranslate !== "boolean") return { valid: false };
    return {
      valid: true,
      shouldTranslate: parsed.shouldTranslate,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    };
  } catch {
    return { valid: false };
  }
};

const translationDecisionSchema = z.object({
  shouldTranslate: z.boolean(),
  confidence: z.number().optional(),
});

export const checkTranslationNeeded = async ({
  content,
  targetLanguage,
  signal,
}) => {
  const locale = normalizeAppLocale(targetLanguage || "en-US");
  const sample = String(content || "").trim().slice(0, 1000);
  if (!sample) return { error: new Error("Precheck sample is empty"), invalid: true };
  if (signal?.aborted) return { aborted: true };

  const messages = [
    {
      role: "user",
      content: `Target system language: ${getTargetLanguageName(locale)} (${locale})\n\nArticle excerpt:\n${sample}`,
    },
  ];
  const options = {
    signal,
    max_tokens: DEFAULT_COMPLETION_MAX_TOKENS,
    temperature: 0.2,
    extraSystemMessages: [
      getTargetLanguageInstruction(locale),
      "Determine whether the article excerpt needs translation into the target system language.",
    ],
  };

  try {
    const result = await generateText({
      ...buildGenerationOptions("translation", messages, options),
      output: Output.object({ schema: translationDecisionSchema }),
    });
    const decision = result.output;
    if (typeof decision?.shouldTranslate !== "boolean") {
      return { error: new Error("Invalid precheck response"), invalid: true };
    }
    return {
      shouldTranslate: decision.shouldTranslate,
      confidence: decision.confidence,
    };
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") return { aborted: true };
    const canFallbackToText =
      [400, 404, 422].includes(error?.statusCode) ||
      /json_schema|response_format|structured output/i.test(
        error?.message || "",
      );
    if (!canFallbackToText) return { error };

    // Some older OpenAI-compatible endpoints do not implement json_schema.
    // Keep them usable with a single plain-text fallback while modern models
    // get schema validation from AI SDK.
    try {
      const fallback = await generateText({
        ...buildGenerationOptions("translation", messages, {
          ...options,
          extraSystemMessages: [
            ...options.extraSystemMessages,
            'Reply with JSON only: {"shouldTranslate":true,"confidence":0.95}.',
          ],
        }),
      });
      const parsed = parseTranslationPrecheckResponse(fallback.text);
      return parsed.valid
        ? {
            shouldTranslate: parsed.shouldTranslate,
            confidence: parsed.confidence,
          }
        : { error: new Error("Invalid precheck response"), invalid: true };
    } catch (fallbackError) {
      if (signal?.aborted || fallbackError?.name === "AbortError") {
        return { aborted: true };
      }
      return { error: fallbackError };
    }
  }
};

const streamCapabilityChat = async (
  capability,
  messages,
  { onChunk, onDone, onError },
  options = {},
) => {
  try {
    if (options.signal?.aborted) {
      onDone();
      return;
    }

    const generation = streamText(
      {
        ...buildGenerationOptions(capability, messages, options),
        onError: () => {},
      },
    );
    let emittedContent = false;
    const pushFilteredChunk = createThinkFilter((chunk) => {
      if (!chunk) return;
      emittedContent = true;
      onChunk(chunk);
    });

    for await (const part of generation.fullStream) {
      if (part.type === "text-delta") {
        pushFilteredChunk(part.text);
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    if (!emittedContent) throw new Error("AI returned an empty response");
    onDone();
  } catch (error) {
    if (options.signal?.aborted || error?.name === "AbortError") {
      onDone();
      return;
    }
    onError(error instanceof Error ? error : new Error(String(error)));
  }
};

export const summarizeArticleStream = async (
  article,
  { onChunk, onDone, onError },
) => {
  const plainText = getPlainText(article.content || "");
  return streamCapabilityChat(
    "summary",
    [
      {
        role: "user",
        content: `Please summarize this article:\n\nTitle: ${article.title || ""}\n\n${plainText.slice(0, 8000)}`,
      },
    ],
    { onChunk, onDone, onError },
  );
};

export const translateTextStream = async (
  text,
  { onChunk, onDone, onError, targetLanguage, signal },
) =>
  streamCapabilityChat(
    "translation",
    [{ role: "user", content: text }],
    { onChunk, onDone, onError },
    {
      signal,
      temperature: 0.2,
      extraSystemMessages: [
        getTargetLanguageInstruction(targetLanguage || "en-US"),
      ],
    },
  );
