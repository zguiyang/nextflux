import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkTranslationNeeded,
  fetchAIModels,
  parseTranslationPrecheckResponse,
  summarizeArticleStream,
  testAIConnection,
  translateTextStream,
} from "./ai.js";
import { getAICapability } from "@/stores/settingsStore.js";

vi.mock("@/stores/settingsStore.js", () => ({
  getAICapability: vi.fn(),
}));

const completionResponse = (content = "OK") =>
  new Response(
    JSON.stringify({
      id: "completion-id",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const streamResponse = (lines) => {
  const encoder = new TextEncoder();
  const newline = String.fromCharCode(10);
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}${newline}${newline}`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
};

describe("AI SDK provider integration", () => {
  beforeEach(() => {
    vi.mocked(getAICapability).mockImplementation((capability) => ({
      provider: {
        apiKey: `${capability}-key`,
        baseUrl: "https://example.com/v1",
      },
      model: { modelId: `${capability}-model` },
      prompt: { content: capability === "summary" ? "Summarize clearly" : "Translate faithfully" },
      enableReasoning: false,
    }));
  });

  it("keeps model discovery on the provider compatibility endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      fetchAIModels({ apiKey: "key", baseUrl: "https://example.com/v1/" }),
    ).resolves.toEqual([{ id: "gpt-4o" }, { id: "gpt-4o-mini" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });

  it("uses the AI SDK chat provider for connection tests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(completionResponse());

    await expect(
      testAIConnection({
        apiKey: "key",
        baseUrl: "https://example.com/v1/",
        model: " custom-model ",
      }),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.any(Object),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: "custom-model",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
  });

  it("selects the AI SDK Responses provider when configured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "response-id",
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          status: "completed",
          output: [],
          output_text: "OK",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await testAIConnection({
      apiKey: "key",
      baseUrl: "https://example.com/v1",
      model: "response-model",
      apiProtocol: "responses",
    });

    expect(fetch.mock.calls[0][0]).toBe("https://example.com/v1/responses");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      input: [{ role: "user", content: [{ type: "input_text", text: "Reply with OK." }] }],
      max_output_tokens: 16,
    });
  });

  it("streams article summaries through AI SDK", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        {
          id: "chunk-id",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { role: "assistant", content: "Done" }, finish_reason: null }],
        },
      ]),
    );
    const chunks = [];
    const onDone = vi.fn();

    await summarizeArticleStream(
      { title: "Hello", content: "<p>World</p>" },
      { onChunk: (chunk) => chunks.push(chunk), onDone, onError: vi.fn() },
    );

    expect(chunks.join("")).toBe("Done");
    expect(onDone).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: "summary-model",
      max_tokens: 2048,
      stream: true,
    });
  });

  it("streams Responses text events without hand-written SSE parsing", async () => {
    vi.mocked(getAICapability).mockReturnValue({
      provider: {
        apiKey: "summary-key",
        baseUrl: "https://example.com/v1",
        apiProtocol: "responses",
      },
      model: { modelId: "response-model" },
      prompt: { content: "Summarize clearly" },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "response.created",
          response: {
            id: "response-id",
            created_at: Math.floor(Date.now() / 1000),
            model: "response-model",
          },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "message", id: "item" },
        },
        { type: "response.output_text.delta", item_id: "item", delta: "响应" },
        { type: "response.output_text.delta", item_id: "item", delta: "成功" },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: { type: "message", id: "item" },
        },
        {
          type: "response.completed",
          response: {
            id: "response-id",
            created_at: Math.floor(Date.now() / 1000),
            model: "response-model",
            status: "completed",
            output: [],
          },
        },
      ]),
    );
    const chunks = [];
    const onDone = vi.fn();
    const onError = vi.fn();

    await summarizeArticleStream(
      { title: "Hello", content: "World" },
      { onChunk: (chunk) => chunks.push(chunk), onDone, onError },
    );

    expect(chunks.join("")).toBe("响应成功");
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][0]).toBe("https://example.com/v1/responses");
  });

  it("uses schema-validated output for translation prechecks", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      completionResponse('{"shouldTranslate":false,"confidence":0.96}'),
    );

    await expect(
      checkTranslationNeeded({
        content: "这是一段中文正文。",
        targetLanguage: "zh-CN",
      }),
    ).resolves.toEqual({ shouldTranslate: false, confidence: 0.96 });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it("passes the enabled reasoning preference through AI SDK provider options", async () => {
    vi.mocked(getAICapability).mockReturnValue({
      provider: {
        apiKey: "summary-key",
        baseUrl: "https://example.com/v1",
      },
      model: { modelId: "custom-reasoning-model" },
      prompt: { content: "Summarize clearly" },
      enableReasoning: true,
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        {
          id: "chunk-id",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "完成" }, finish_reason: null }],
        },
      ]),
    );

    await summarizeArticleStream(
      { title: "Hello", content: "World" },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    );

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      reasoning_effort: "medium",
    });
  });

  it("explicitly disables DeepSeek thinking mode by default", async () => {
    vi.mocked(getAICapability).mockReturnValue({
      provider: {
        apiKey: "translation-key",
        baseUrl: "https://api.deepseek.com/v1",
      },
      model: { modelId: "deepseek-v4-pro" },
      prompt: { content: "Translate faithfully" },
      enableReasoning: false,
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        {
          id: "chunk-id",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "完成" }, finish_reason: null }],
        },
      ]),
    );

    await translateTextStream("Hello", {
      targetLanguage: "zh-CN",
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      thinking: { type: "disabled" },
      reasoning_effort: "none",
    });
  });

  it("preserves the think-tag compatibility filter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        {
          id: "chunk-1",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "Start <think>hidden" }, finish_reason: null }],
        },
        {
          id: "chunk-2",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: " thought</think> End" }, finish_reason: null }],
        },
      ]),
    );
    const chunks = [];

    await translateTextStream("Hello", {
      targetLanguage: "zh-CN",
      onChunk: (chunk) => chunks.push(chunk),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(chunks.join("")).toBe("Start End");
  });

  it("maps an aborted stream to completion without surfacing an error", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);
    const onDone = vi.fn();
    const onError = vi.fn();

    await translateTextStream("Hello", {
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError,
    });

    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("retains the public parser for legacy precheck text", () => {
    expect(
      parseTranslationPrecheckResponse(
        '```json\n{"shouldTranslate":false,"confidence":0.97}\n```',
      ),
    ).toEqual({ valid: true, shouldTranslate: false, confidence: 0.97 });
  });
});
