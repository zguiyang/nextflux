import { getAICapability } from "@/stores/settingsStore.js";
import {
  estimateTranslationMaxTokens,
  getTargetLanguageInstruction,
  getTargetLanguageName,
  normalizeAppLocale,
} from "@/lib/bilingualLanguage.js";

const normalizeBaseUrl = (baseUrl) => baseUrl.trim().replace(/\/+$/, "");

const getAPIError = async (response) => {
  const error = await response.json().catch(() => ({}));
  return new Error(
    error?.error?.message ||
      error?.message ||
      `API error: ${response.status}`,
  );
};

const getAIRequestOptions = (apiKey) => ({
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
});

export const fetchAIModels = async ({ apiKey, baseUrl }) => {
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");

  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/models`,
    getAIRequestOptions(apiKey),
  );
  if (!response.ok) throw await getAPIError(response);

  const payload = await response.json();
  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return [
    ...new Set(
      models
        .map((model) => (typeof model === "string" ? model : model?.id))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
};

export const testAIConnection = async ({ apiKey, baseUrl, model }) => {
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");
  if (!model?.trim()) throw new Error("AI model not configured");

  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
    },
  );
  if (!response.ok) throw await getAPIError(response);
};

const getPlainText = (html) => {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.innerText.replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
};

// 返回字符串 str 中可以安全 emit 的前缀长度：
// 末尾可能是 tag 的部分前缀，需要保留等待后续 chunk 确认
function safeEmitLength(str, tag) {
  for (let i = Math.min(tag.length - 1, str.length); i > 0; i--) {
    if (tag.startsWith(str.slice(str.length - i))) {
      return str.length - i;
    }
  }
  return str.length;
}

// 创建一个有状态的思考内容过滤器
// 过滤 <think>…</think> 标签（DeepSeek-R1、QwQ 等模型的推理过程）
// 同时忽略 reasoning_content 字段（DeepSeek 原生 API）
function createThinkFilter(onChunk) {
  let inThinking = false;
  let pending = "";

  return function push(delta) {
    pending += delta;

    while (pending) {
      if (inThinking) {
        const closeIdx = pending.indexOf("</think>");
        if (closeIdx >= 0) {
          inThinking = false;
          // 跳过 </think> 后紧跟的换行/空格，避免多余空行
          pending = pending.slice(closeIdx + 8).replace(/^\s+/, "");
        } else {
          // 保留末尾可能是 </think> 部分前缀的内容，其余丢弃
          pending = pending.slice(safeEmitLength(pending, "</think>"));
          break;
        }
      } else {
        const openIdx = pending.indexOf("<think>");
        if (openIdx >= 0) {
          if (openIdx > 0) onChunk(pending.slice(0, openIdx));
          inThinking = true;
          pending = pending.slice(openIdx + 7);
        } else {
          // 末尾可能是 <think> 的部分前缀，暂不 emit
          const safe = safeEmitLength(pending, "<think>");
          if (safe > 0) {
            onChunk(pending.slice(0, safe));
            pending = pending.slice(safe);
          }
          break;
        }
      }
    }
  };
}

const capabilityChat = async (
  capability,
  messages,
  options = {},
) => {
  const { provider, model, prompt } = getAICapability(capability);
  const aiApiKey = provider?.apiKey;
  const aiBaseUrl = provider?.baseUrl;
  const aiModel = model?.modelId;
  const aiPrompt = prompt?.content;

  if (!aiApiKey) {
    throw new Error("AI API Key not configured");
  }
  if (!aiModel?.trim()) {
    throw new Error("AI model not configured");
  }

  if (options.signal?.aborted) {
    return { aborted: true };
  }

  const baseUrl = normalizeBaseUrl(aiBaseUrl);
  const requestMessages = [
    ...(aiPrompt ? [{ role: "system", content: aiPrompt }] : []),
    ...(options.extraSystemMessages || []).map((content) => ({
      role: "system",
      content,
    })),
    ...messages,
  ];

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: aiModel.trim(),
        stream: false,
        messages: requestMessages,
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
      }),
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return { aborted: true };
    }
    throw err;
  }

  if (!response.ok) {
    throw await getAPIError(response);
  }

  const payload = await response.json();
  return {
    content: payload.choices?.[0]?.message?.content?.trim() || "",
  };
};

export const parseTranslationPrecheckResponse = (raw) => {
  if (!raw || typeof raw !== "string") {
    return { valid: false };
  }

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return { valid: false };
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed.shouldTranslate !== "boolean") {
      return { valid: false };
    }

    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : undefined;

    return {
      valid: true,
      shouldTranslate: parsed.shouldTranslate,
      confidence,
    };
  } catch {
    return { valid: false };
  }
};

export const checkTranslationNeeded = async ({
  content,
  targetLanguage,
  signal,
}) => {
  const locale = normalizeAppLocale(targetLanguage || "en-US");
  const sample = String(content || "").trim().slice(0, 1000);
  if (!sample) {
    return { error: new Error("Precheck sample is empty"), invalid: true };
  }

  try {
    const result = await capabilityChat(
      "translation",
      [
        {
          role: "user",
          content: `Target system language: ${getTargetLanguageName(locale)} (${locale})\n\nArticle excerpt:\n${sample}`,
        },
      ],
      {
        signal,
        max_tokens: 128,
        temperature: 0,
        extraSystemMessages: [
          getTargetLanguageInstruction(locale),
          'Determine whether the article excerpt needs translation into the target system language. Reply with JSON only in this exact shape: {"shouldTranslate":true,"confidence":0.95}. Use shouldTranslate=false when the excerpt is already in the target language.',
        ],
      },
    );

    if (result?.aborted || signal?.aborted) {
      return { aborted: true };
    }

    const parsed = parseTranslationPrecheckResponse(result.content);
    if (!parsed.valid) {
      return {
        error: new Error("Invalid precheck response"),
        invalid: true,
      };
    }

    return {
      shouldTranslate: parsed.shouldTranslate,
      confidence: parsed.confidence,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { aborted: true };
    }
    return { error: err };
  }
};

const streamCapabilityChat = async (
  capability,
  messages,
  { onChunk, onDone, onError },
  options = {},
) => {
  const { provider, model, prompt } = getAICapability(capability);
  const aiApiKey = provider?.apiKey;
  const aiBaseUrl = provider?.baseUrl;
  const aiModel = model?.modelId;
  const aiPrompt = prompt?.content;

  if (!aiApiKey) {
    onError(new Error("AI API Key not configured"));
    return;
  }
  if (!aiModel?.trim()) {
    onError(new Error("AI model not configured"));
    return;
  }

  const baseUrl = normalizeBaseUrl(aiBaseUrl);
  const requestMessages = [
    ...(aiPrompt ? [{ role: "system", content: aiPrompt }] : []),
    ...(options.extraSystemMessages || []).map((content) => ({
      role: "system",
      content,
    })),
    ...messages,
  ];

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: aiModel.trim(),
        stream: true,
        messages: requestMessages,
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
      }),
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      onDone();
      return;
    }
    onError(err);
    return;
  }

  if (!response.ok) {
    onError(await getAPIError(response));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  const pushChunk = createThinkFilter(onChunk);

  try {
    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") return;
      if (!trimmed.startsWith("data: ")) return;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) pushChunk(delta);
      } catch {
        // skip malformed SSE lines
      }
    };

    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        sseBuffer += decoder.decode(value, { stream: true });
      }

      if (done) {
        if (sseBuffer.trim()) {
          processLine(sseBuffer);
        }
        break;
      }

      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop();

      for (const line of lines) {
        processLine(line);
      }
    }
    onDone();
  } catch (err) {
    if (err?.name === "AbortError") {
      onDone();
      return;
    }
    onError(err);
  }
};

export const summarizeArticleStream = async (article, { onChunk, onDone, onError }) => {
  const plainText = getPlainText(article.content || "");
  const title = article.title || "";

  return streamCapabilityChat(
    "summary",
    [
      {
        role: "user",
        content: `Please summarize this article:\n\nTitle: ${title}\n\n${plainText.slice(0, 8000)}`,
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
      max_tokens: estimateTranslationMaxTokens(text),
      temperature: 0.2,
      extraSystemMessages: [
        getTargetLanguageInstruction(targetLanguage || "en-US"),
      ],
      signal,
    },
  );
