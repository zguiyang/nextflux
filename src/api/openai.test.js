import { describe, expect, it, vi } from "vitest";
import {
  fetchAIModels,
  summarizeArticleStream,
  testAIConnection,
} from "./openai.js";

vi.mock("@/stores/settingsStore.js", () => ({
  getAICapability: vi.fn(() => ({
    provider: {
      apiKey: "summary-key",
      baseUrl: "https://example.com/v1",
    },
    model: { modelId: "summary-model" },
    prompt: { content: "Summarize clearly" },
  })),
}));

describe("OpenAI-compatible API helpers", () => {
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
});
