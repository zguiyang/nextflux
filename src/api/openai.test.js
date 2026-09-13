import { describe, expect, it, vi } from "vitest";
import { fetchAIModels, testAIConnection } from "./openai.js";

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
});
