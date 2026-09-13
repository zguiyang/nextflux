import { getAICapability } from "@/stores/settingsStore.js";
import {
  getTargetLanguageInstruction,
  getTargetLanguageName,
  normalizeAppLocale,
} from "@/lib/bilingualLanguage.js";

const AI_LOG_PREFIX = "[Nextflux AI]";
const logAI = (...args) => console.log(AI_LOG_PREFIX, ...args);
const warnAI = (...args) => console.warn(AI_LOG_PREFIX, ...args);

const normalizeBaseUrl = (baseUrl) => baseUrl.trim().replace(/\/+$/, "");
export const DEFAULT_COMPLETION_MAX_TOKENS = 2048;
export const CONNECTION_TEST_MAX_TOKENS = 16;

const normalizeAPIProtocol = (apiProtocol) =>
  apiProtocol === "responses" ? "responses" : "chat";

const getCompletionUrl = (baseUrl, apiProtocol) =>
  `${normalizeBaseUrl(baseUrl)}/${normalizeAPIProtocol(apiProtocol) === "responses" ? "responses" : "chat/completions"}`;

const getEffectiveMaxOutputTokens = (model, requested) => {
  const candidate = Number(requested ?? model?.maxOutputTokens);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_COMPLETION_MAX_TOKENS;
  }
  return Math.max(CONNECTION_TEST_MAX_TOKENS, Math.floor(candidate));
};

const getResponseText = (payload) => {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter(
      (item) => item?.type === "output_text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("");
};

const buildRequestMessages = (prompt, messages, extraSystemMessages = []) => [
  ...(prompt ? [{ role: "system", content: prompt }] : []),
  ...extraSystemMessages.map((content) => ({
    role: "system",
    content,
  })),
  ...messages,
];

const buildResponsesInput = (messages) => {
  const inputMessages = messages.filter((message) => message.role !== "system");
  if (inputMessages.length === 1 && inputMessages[0].role === "user") {
    return inputMessages[0].content;
  }
  return inputMessages;
};

const buildRequestBody = ({
  apiProtocol,
  model,
  messages,
  stream,
  maxOutputTokens,
  temperature,
}) => {
  if (normalizeAPIProtocol(apiProtocol) === "responses") {
    const instructions = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .filter(Boolean)
      .join("\n\n");
    return {
      model,
      input: buildResponsesInput(messages),
      stream,
      max_output_tokens: maxOutputTokens,
      ...(instructions ? { instructions } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    };
  }

  return {
    model,
    stream,
    messages,
    max_tokens: maxOutputTokens,
    ...(temperature !== undefined ? { temperature } : {}),
  };
};

const getAPIError = async (response) => {
  const error = await response.json().catch(() => ({}));
  return new Error(
    error?.error?.message || error?.message || `API error: ${response.status}`,
  );
};

const getAIRequestOptions = (apiKey) => ({
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
});

export const fetchAIModels = async ({ apiKey, baseUrl }) => {
  logAI("models request start", { baseUrl: baseUrl || "" });
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");

  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/models`,
    getAIRequestOptions(apiKey),
  );
  logAI("models response received", {
    status: response.status,
    ok: response.ok,
    contentType: response.headers?.get?.("content-type") || "unknown",
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
          ? {
              maxOutputTokens: Math.max(
                CONNECTION_TEST_MAX_TOKENS,
                Math.floor(maxOutputTokens),
              ),
            }
          : {}),
      };
    })
    .filter(Boolean);
  const uniqueModels = Array.from(
    new Map(normalizedModels.map((model) => [model.id, model])).values(),
  ).sort((a, b) => a.id.localeCompare(b.id));
  logAI("models response parsed", { modelCount: uniqueModels.length });
  return uniqueModels;
};

export const testAIConnection = async ({
  apiKey,
  baseUrl,
  model,
  apiProtocol,
}) => {
  const protocol = normalizeAPIProtocol(apiProtocol);
  logAI("connection test start", {
    baseUrl: baseUrl || "",
    model: model || "",
    protocol,
  });
  if (!apiKey) throw new Error("AI API Key not configured");
  if (!baseUrl) throw new Error("AI Base URL not configured");
  if (!model?.trim()) throw new Error("AI model not configured");

  const response = await fetch(getCompletionUrl(baseUrl, protocol), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.trim(),
      ...(protocol === "responses"
        ? {
            input: "Reply with OK.",
            stream: false,
            max_output_tokens: CONNECTION_TEST_MAX_TOKENS,
          }
        : {
            messages: [{ role: "user", content: "Reply with OK." }],
            stream: false,
            max_tokens: CONNECTION_TEST_MAX_TOKENS,
          }),
    }),
  });
  logAI("connection test response", {
    status: response.status,
    ok: response.ok,
  });
  if (!response.ok) throw await getAPIError(response);
  logAI("connection test succeeded", { model: model.trim(), protocol });
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

const capabilityChat = async (capability, messages, options = {}) => {
  const { provider, model, prompt } = getAICapability(capability);
  const aiApiKey = provider?.apiKey;
  const aiBaseUrl = provider?.baseUrl;
  const aiModel = model?.modelId;
  const aiPrompt = prompt?.content;
  const apiProtocol = normalizeAPIProtocol(provider?.apiProtocol);

  logAI("capability resolved", {
    capability,
    hasApiKey: Boolean(aiApiKey),
    baseUrl: aiBaseUrl || "",
    model: aiModel || "",
    protocol: apiProtocol,
    hasPrompt: Boolean(aiPrompt),
  });

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
  const requestMessages = buildRequestMessages(
    aiPrompt,
    messages,
    options.extraSystemMessages || [],
  );
  const maxOutputTokens = getEffectiveMaxOutputTokens(
    model,
    options.max_tokens,
  );
  const url = getCompletionUrl(baseUrl, apiProtocol);

  logAI("request start", {
    capability,
    mode: "json",
    protocol: apiProtocol,
    url,
    model: aiModel.trim(),
    messageCount: requestMessages.length,
    maxTokens: maxOutputTokens,
  });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify(
        buildRequestBody({
          apiProtocol,
          model: aiModel.trim(),
          messages: requestMessages,
          stream: false,
          maxOutputTokens,
          temperature: options.temperature ?? 0.3,
        }),
      ),
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      logAI("request aborted", { capability, mode: "json" });
      return { aborted: true };
    }
    warnAI("request failed", {
      capability,
      mode: "json",
      name: err?.name,
      message: err?.message || String(err),
    });
    throw err;
  }

  logAI("response received", {
    capability,
    mode: "json",
    protocol: apiProtocol,
    status: response.status,
    ok: response.ok,
    contentType: response.headers?.get?.("content-type") || "unknown",
  });

  if (!response.ok) {
    throw await getAPIError(response);
  }

  const payload = await response.json();
  const content =
    (apiProtocol === "responses"
      ? getResponseText(payload)
      : payload.choices?.[0]?.message?.content
    )?.trim() || "";
  logAI("response parsed", {
    capability,
    mode: "json",
    choiceCount: Array.isArray(payload.choices) ? payload.choices.length : 0,
    contentChars: content.length,
  });
  return {
    content,
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
  const sample = String(content || "")
    .trim()
    .slice(0, 1000);
  logAI("translation precheck start", {
    targetLanguage: locale,
    sampleChars: sample.length,
  });
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
        max_tokens: DEFAULT_COMPLETION_MAX_TOKENS,
        temperature: 0.2,
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
    logAI("translation precheck result", {
      valid: parsed.valid,
      shouldTranslate: parsed.valid ? parsed.shouldTranslate : undefined,
      confidence: parsed.valid ? parsed.confidence : undefined,
    });
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
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onDone();
  };
  const fail = (error) => {
    if (settled) return;
    settled = true;
    onError(error instanceof Error ? error : new Error(String(error)));
  };

  try {
    const { provider, model, prompt } = getAICapability(capability);
    const aiApiKey = provider?.apiKey;
    const aiBaseUrl = provider?.baseUrl;
    const aiModel = model?.modelId;
    const aiPrompt = prompt?.content;
    const apiProtocol = normalizeAPIProtocol(provider?.apiProtocol);

    logAI("capability resolved", {
      capability,
      hasApiKey: Boolean(aiApiKey),
      baseUrl: aiBaseUrl || "",
      model: aiModel || "",
      protocol: apiProtocol,
      hasPrompt: Boolean(aiPrompt),
    });

    if (!aiApiKey) {
      fail(new Error("AI API Key not configured"));
      return;
    }
    if (!aiModel?.trim()) {
      fail(new Error("AI model not configured"));
      return;
    }

    const baseUrl = normalizeBaseUrl(aiBaseUrl);
    const requestMessages = buildRequestMessages(
      aiPrompt,
      messages,
      options.extraSystemMessages || [],
    );
    const maxOutputTokens = getEffectiveMaxOutputTokens(
      model,
      options.max_tokens,
    );
    const url = getCompletionUrl(baseUrl, apiProtocol);

    logAI("request start", {
      capability,
      mode: "stream",
      protocol: apiProtocol,
      url,
      model: aiModel.trim(),
      messageCount: requestMessages.length,
      maxTokens: maxOutputTokens,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify(
        buildRequestBody({
          apiProtocol,
          model: aiModel.trim(),
          messages: requestMessages,
          stream: true,
          maxOutputTokens,
          temperature: options.temperature ?? 0.3,
        }),
      ),
    });
    logAI("response received", {
      capability,
      mode: "stream",
      protocol: apiProtocol,
      status: response.status,
      ok: response.ok,
      contentType: response.headers?.get?.("content-type") || "unknown",
    });
    if (!response.ok) {
      fail(await getAPIError(response));
      return;
    }

    const reader = response.body?.getReader?.();
    if (!reader) {
      throw new Error("AI response body is not readable");
    }

    const decoder = new TextDecoder();
    let sseBuffer = "";
    let rawResponseText = "";
    let emittedContent = false;
    let readCount = 0;
    let sseDataCount = 0;
    let emittedChunkCount = 0;
    let emittedCharCount = 0;
    const pushChunk = createThinkFilter((chunk) => {
      if (!chunk) return;
      emittedContent = true;
      emittedChunkCount += 1;
      emittedCharCount += chunk.length;
      onChunk(chunk);
    });

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") return;
      if (!trimmed.startsWith("data:")) return;
      sseDataCount += 1;

      let json;
      try {
        json = JSON.parse(trimmed.slice(5).trimStart());
      } catch {
        // Skip malformed SSE lines while preserving the rest of the stream.
        return;
      }

      if (json.type === "error" || json.type === "response.failed") {
        throw new Error(
          json.message ||
            json.response?.error?.message ||
            "Responses API request failed",
        );
      }
      if (json.type === "response.incomplete") {
        throw new Error(
          `Responses API response incomplete: ${json.response?.incomplete_details?.reason || "unknown reason"}`,
        );
      }

      const delta =
        apiProtocol === "responses"
          ? json.type === "response.output_text.delta"
            ? json.delta
            : json.type === "response.output_text.done" && !emittedContent
              ? json.text
              : json.type === "response.completed" && !emittedContent
                ? getResponseText(json.response)
                : ""
          : json.choices?.[0]?.delta?.content;
      if (delta) pushChunk(delta);
    };

    while (true) {
      const { done, value } = await reader.read();
      readCount += 1;

      if (value) {
        const decoded = decoder.decode(value, { stream: true });
        rawResponseText += decoded;
        sseBuffer += decoded;
      }

      if (done) {
        const decoded = decoder.decode();
        rawResponseText += decoded;
        sseBuffer += decoded;
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

    if (!emittedContent && rawResponseText.trim()) {
      try {
        const payload = JSON.parse(rawResponseText.trim());
        const content =
          apiProtocol === "responses"
            ? getResponseText(payload)
            : payload.choices?.[0]?.message?.content ||
              payload.choices?.[0]?.text ||
              "";
        if (content) {
          onChunk(content);
          emittedContent = true;
          emittedChunkCount += 1;
          emittedCharCount += content.length;
        }
      } catch {
        // The response was neither valid JSON nor a usable SSE stream.
      }
    }

    if (!emittedContent) {
      throw new Error("AI returned an empty or unsupported response");
    }
    logAI("stream completed", {
      capability,
      readCount,
      sseDataCount,
      emittedChunkCount,
      emittedCharCount,
      rawResponseChars: rawResponseText.length,
    });
    finish();
  } catch (err) {
    if (err?.name === "AbortError") {
      logAI("request aborted", { capability, mode: "stream" });
      finish();
      return;
    }
    warnAI("request failed", {
      capability,
      mode: "stream",
      name: err?.name,
      message: err?.message || String(err),
    });
    fail(err);
  }
};

export const summarizeArticleStream = async (
  article,
  { onChunk, onDone, onError },
) => {
  const plainText = getPlainText(article.content || "");
  const title = article.title || "";
  logAI("summary start", {
    articleId: article.id,
    titleChars: title.length,
    contentChars: plainText.length,
  });

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
) => {
  logAI("translation start", {
    targetLanguage: targetLanguage || "en-US",
    contentChars: String(text || "").length,
  });

  return streamCapabilityChat(
    "translation",
    [{ role: "user", content: text }],
    { onChunk, onDone, onError },
    {
      temperature: 0.2,
      extraSystemMessages: [
        getTargetLanguageInstruction(targetLanguage || "en-US"),
      ],
      signal,
    },
  );
};
