import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkTranslationNeeded,
  fetchAIModels,
  parseTranslationPrecheckResponse,
  summarizeArticleStream,
  testAIConnection,
  translateTextStream,
} from "./openai.js";
import { getAICapability } from "@/stores/settingsStore.js";

vi.mock("@/stores/settingsStore.js", () => ({
  getAICapability: vi.fn(),
}));

describe("OpenAI-compatible API helpers", () => {
  beforeEach(() => {
    vi.mocked(getAICapability).mockImplementation((capability) => {
      if (capability === "translation") {
        return {
          provider: {
            apiKey: "translation-key",
            baseUrl: "https://example.com/v1",
          },
          model: { modelId: "translation-model" },
          prompt: { content: "Translate faithfully" },
        };
      }

      return {
        provider: {
          apiKey: "summary-key",
          baseUrl: "https://example.com/v1",
        },
        model: { modelId: "summary-model" },
        prompt: { content: "Summarize clearly" },
      };
    });
  });

  it("normalizes and sorts model ids from a standard /models response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    });

    await expect(
      fetchAIModels({ apiKey: "key", baseUrl: "https://example.com/v1/" }),
    ).resolves.toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });

  it("supports manually entered models for connection testing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await expect(
      testAIConnection({
        apiKey: "key",
        baseUrl: "https://example.com/v1/",
        model: " custom-model ",
      }),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"custom-model"'),
      }),
    );
  });

  it("surfaces provider errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key" } }),
    });

    await expect(
      fetchAIModels({ apiKey: "bad-key", baseUrl: "https://example.com/v1" }),
    ).rejects.toThrow("Invalid key");
  });

  it("reads summary capability bindings when streaming article summaries", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Done"}}]}\n\n'),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const chunks = [];
    await new Promise((resolve, reject) => {
      summarizeArticleStream(
        { title: "Hello", content: "<p>World</p>" },
        {
          onChunk: (chunk) => chunks.push(chunk),
          onDone: resolve,
          onError: reject,
        },
      );
    });

    expect(chunks.join("")).toBe("Done");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer summary-key",
        }),
        body: expect.stringContaining('"model":"summary-model"'),
      }),
    );
    expect(fetch.mock.calls[0][1].body).toContain("Summarize clearly");
  });

  it("reads translation capability bindings when streaming translations", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"译文"}}]}\n\n'),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const chunks = [];
    await new Promise((resolve, reject) => {
      translateTextStream("Hello world", {
        targetLanguage: "zh-CN",
        onChunk: (chunk) => chunks.push(chunk),
        onDone: resolve,
        onError: reject,
      });
    });

    expect(chunks.join("")).toBe("译文");
    const body = fetch.mock.calls[0][1].body;
    expect(body).toContain('"model":"translation-model"');
    expect(body).toContain("Translate faithfully");
    expect(body).toContain("简体中文");
    expect(body).toContain("Hello world");
    expect(body).not.toContain("Translate faithfully简体中文");
    expect(JSON.parse(body).max_tokens).toBeLessThanOrEqual(2000);
  });

  it("invokes onDone when a translation stream is aborted before fetch completes", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const onDone = vi.fn();
    const onError = vi.fn();
    await translateTextStream("Hello world", {
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError,
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("invokes onDone when a translation stream is aborted while reading", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    const reader = {
      read: vi.fn().mockRejectedValue(abortError),
      cancel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    });

    const onDone = vi.fn();
    const onError = vi.fn();
    await translateTextStream("Hello world", {
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError,
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("parses fenced and noisy translation precheck JSON safely", () => {
    expect(
      parseTranslationPrecheckResponse(
        'Here is the result:\n```json\n{"shouldTranslate":false,"confidence":0.97}\n```',
      ),
    ).toEqual({
      valid: true,
      shouldTranslate: false,
      confidence: 0.97,
    });
    expect(parseTranslationPrecheckResponse("not json at all")).toEqual({
      valid: false,
    });
    expect(
      parseTranslationPrecheckResponse('{"shouldTranslate":"no","confidence":1}'),
    ).toEqual({ valid: false });
  });

  it("checks translation need with translation capability bindings", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"shouldTranslate":false,"confidence":0.96}',
            },
          },
        ],
      }),
    });

    const result = await checkTranslationNeeded({
      content: "这是一段用于预检的中文正文内容，长度足够进行判断。",
      targetLanguage: "zh-CN",
    });

    expect(result.shouldTranslate).toBe(false);
    const body = fetch.mock.calls[0][1].body;
    expect(body).toContain('"model":"translation-model"');
    expect(body).toContain("Translate faithfully");
    expect(body).toContain("简体中文");
    expect(body).toContain('"stream":false');
    expect(body).toContain("shouldTranslate");
  });

  it("aborts translation precheck when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn();

    const result = await checkTranslationNeeded({
      content: "Sample text long enough for precheck.",
      targetLanguage: "en-US",
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("filters redacted thinking tags from translation streams", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Start <think>hidden"}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":" thought</think> End"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const chunks = [];
    await new Promise((resolve, reject) => {
      translateTextStream("Hello", {
        onChunk: (chunk) => chunks.push(chunk),
        onDone: resolve,
        onError: reject,
      });
    });

    expect(chunks.join("")).toBe("Start End");
  });
});
