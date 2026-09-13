// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { checkTranslationNeeded, translateTextStream } from "@/api/openai.js";
import { loadingOriginContent } from "@/stores/articlesStore.js";
import {
  bilingualArticles,
  createBilingualSession,
  initBilingualArticle,
  setOriginalLoaded,
} from "@/stores/bilingualStore.js";
import {
  getTranslationConcurrency,
  invalidateBilingualSession,
  retryBilingualOriginal,
  startBilingualReading,
  stopBilingualReading,
  toggleBilingualReading,
} from "./bilingualHandlers.js";

vi.mock("@/api/openai.js", () => ({
  translateTextStream: vi.fn(),
  checkTranslationNeeded: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockI18n = vi.hoisted(() => ({
  language: "en-US",
  resolvedLanguage: "en-US",
  t: (key) => key,
}));

vi.mock("@/i18n/index.js", () => ({
  default: mockI18n,
}));

describe("bilingualHandlers", () => {
  beforeEach(() => {
    bilingualArticles.set({});
    loadingOriginContent.set(false);
    mockI18n.language = "en-US";
    mockI18n.resolvedLanguage = "en-US";
    vi.mocked(translateTextStream).mockReset();
    vi.mocked(checkTranslationNeeded).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.error).mockReset();
    createBilingualSession();
  });

  const loadedArticle = {
    id: 1,
    title: "Hello",
    content:
      "<p>这是需要翻译的中文正文内容，长度足够触发翻译流程，不会被英文目标语言跳过。</p>",
    shownOriginal: true,
  };

  const realisticChineseArticle = {
    id: 3,
    title: "中文分析",
    content: `<h2>背景介绍</h2>
<p>短注</p>
<p>这是深入分析苹果公司与 <a href="https://www.apple.com/iphone">iPhone</a> 生态的中文长文，结合 React 与 OpenAI 案例说明产业变化与读者应关注的核心趋势。</p>
<ul><li>第一点说明产业格局</li><li>第二点分析技术演进路径</li></ul>`,
    shownOriginal: true,
  };

  it("translates current article content without requiring original mode", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await startBilingualReading({
      id: 1,
      title: "Hello",
      content:
        "<p>这是当前文章中已经存在的内容，即使没有切换到原文模式也应该直接进入双语翻译流程。</p>",
      shownOriginal: false,
    });

    expect(bilingualArticles.get()[1]?.active).toBe(true);
    expect(translateTextStream).toHaveBeenCalled();
  });

  it("uses current article content when cached source status is error", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    bilingualArticles.set({
      1: {
        active: false,
        originalStatus: "error",
        originalContent: null,
        originalError: "Failed to load",
        blocks: [],
        splitSource: null,
        translationStatus: "idle",
        translationError: null,
        sessionId: 0,
      },
    });

    await startBilingualReading({
      id: 1,
      title: "Hello",
      content:
        "<p>这是当前文章中已经存在的内容，即使缓存原文失败也应该使用当前内容翻译。</p>",
      shownOriginal: false,
    });

    expect(bilingualArticles.get()[1]?.active).toBe(true);
    expect(translateTextStream).toHaveBeenCalled();
  });

  it("toggleBilingualReading translates current content without original mode", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await toggleBilingualReading({
      id: 1,
      title: "Hello",
      content:
        "<p>这是当前文章中已经存在的内容，双语按钮应该直接使用它开始翻译。</p>",
      shownOriginal: false,
    });

    expect(bilingualArticles.get()[1]?.active).toBe(true);
    expect(translateTextStream).toHaveBeenCalled();
  });

  it("does nothing when the article has no content", async () => {
    await startBilingualReading({
      id: 8,
      title: "Empty",
      content: "",
      shownOriginal: false,
    });

    expect(bilingualArticles.get()[8]).toBeUndefined();
    expect(translateTextStream).not.toHaveBeenCalled();
    expect(checkTranslationNeeded).not.toHaveBeenCalled();
  });

  it("toggleBilingualReading starts translation when original is loaded", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await toggleBilingualReading(loadedArticle);

    expect(translateTextStream).toHaveBeenCalled();
    expect(bilingualArticles.get()[1]?.active).toBe(true);
    expect(bilingualArticles.get()[1]?.originalStatus).toBe("loaded");
  });

  it("translates immediately when reader view content is already loaded", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await startBilingualReading(loadedArticle);

    expect(translateTextStream).toHaveBeenCalled();
    expect(bilingualArticles.get()[1].originalStatus).toBe("loaded");
  });

  it("does not start bilingual reading while reader view is loading", async () => {
    loadingOriginContent.set(true);

    await startBilingualReading(loadedArticle);

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[1]).toBeUndefined();
  });

  it("shows toast and stays inactive for English content under en-US", async () => {
    await startBilingualReading({
      ...loadedArticle,
      content:
        "<p>This is a long enough English paragraph to detect the target language reliably for skipping.</p>",
    });

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[1]).toBeUndefined();
    expect(toast.info).toHaveBeenCalledWith(
      "articleView.bilingualSameLanguageAsSystem",
    );
  });

  it("shows toast and stays inactive for Chinese content under zh-CN", async () => {
    mockI18n.language = "zh-CN";

    await startBilingualReading(loadedArticle);

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[1]).toBeUndefined();
    expect(toast.info).toHaveBeenCalledWith(
      "articleView.bilingualSameLanguageAsSystem",
    );
  });

  it("shows toast for realistic Chinese article html under zh-CN locale variants", async () => {
    for (const locale of ["zh-CN", "zh-cn", "zh_CN", "zh"]) {
      mockI18n.language = locale;
      mockI18n.resolvedLanguage = locale;
      vi.mocked(toast.info).mockClear();

      await startBilingualReading(realisticChineseArticle);

      expect(translateTextStream).not.toHaveBeenCalled();
      expect(bilingualArticles.get()[3]).toBeUndefined();
      expect(toast.info).toHaveBeenCalledWith(
        "articleView.bilingualSameLanguageAsSystem",
      );
    }
  });

  it("runs AI precheck for mixed content and skips when precheck says no translation", async () => {
    mockI18n.language = "zh-CN";
    vi.mocked(checkTranslationNeeded).mockResolvedValue({
      shouldTranslate: false,
      confidence: 0.95,
    });

    await startBilingualReading({
      id: 4,
      title: "Mixed",
      content:
        "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>",
      shownOriginal: true,
    });

    expect(checkTranslationNeeded).toHaveBeenCalledTimes(1);
    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[4]).toBeUndefined();
    expect(toast.info).toHaveBeenCalledWith(
      "articleView.bilingualSameLanguageAsSystem",
    );
  });

  it("runs AI precheck and translates only when precheck returns true", async () => {
    mockI18n.language = "zh-CN";
    vi.mocked(checkTranslationNeeded).mockResolvedValue({
      shouldTranslate: true,
      confidence: 0.93,
    });
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await startBilingualReading({
      id: 5,
      title: "Mixed translate",
      content:
        "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>",
      shownOriginal: true,
    });

    expect(checkTranslationNeeded).toHaveBeenCalledTimes(1);
    expect(translateTextStream).toHaveBeenCalled();
    expect(bilingualArticles.get()[5]?.active).toBe(true);
  });

  it("shows precheck failure without creating bilingual error blocks", async () => {
    mockI18n.language = "zh-CN";
    vi.mocked(checkTranslationNeeded).mockResolvedValue({
      error: new Error("Provider unavailable"),
    });

    await startBilingualReading({
      id: 6,
      title: "Mixed fail",
      content:
        "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>",
      shownOriginal: true,
    });

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[6]).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Provider unavailable");
  });

  it("aborts in-flight precheck when bilingual session is invalidated", async () => {
    mockI18n.language = "zh-CN";
    vi.mocked(checkTranslationNeeded).mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => resolve({ aborted: true }),
            { once: true },
          );
        }),
    );

    const pending = startBilingualReading({
      id: 7,
      title: "Mixed abort",
      content:
        "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>",
      shownOriginal: true,
    });

    await vi.waitFor(() => {
      expect(checkTranslationNeeded).toHaveBeenCalled();
    });

    invalidateBilingualSession();
    await pending;

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[7]).toBeUndefined();
  });

  it("does not reuse stale error blocks when same-language article is intercepted", async () => {
    mockI18n.language = "zh-CN";
    bilingualArticles.set({
      3: {
        active: false,
        originalStatus: "loaded",
        originalContent: realisticChineseArticle.content,
        originalError: null,
        blocks: [
          {
            id: "block-stale",
            html: "<p>旧块</p>",
            text: "旧块",
            skipTranslation: false,
            translatedText: "",
            status: "error",
            error: "An unexpected error occurred.",
          },
        ],
        splitSource: realisticChineseArticle.content,
        translationStatus: "error",
        translationError: "An unexpected error occurred.",
        sessionId: 0,
      },
    });

    const staleState = bilingualArticles.get()[3];

    await startBilingualReading(realisticChineseArticle);

    expect(translateTextStream).not.toHaveBeenCalled();
    expect(bilingualArticles.get()[3]).toEqual(staleState);
    expect(bilingualArticles.get()[3]?.active).toBe(false);
    expect(bilingualArticles.get()[3]?.blocks[0]?.status).toBe("error");
    expect(toast.info).toHaveBeenCalledWith(
      "articleView.bilingualSameLanguageAsSystem",
    );
  });

  it("ignores stale translation chunks after the session changes", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      (_text, { onChunk, onDone }) =>
        new Promise((resolve) => {
          setTimeout(() => {
            onChunk("late chunk");
            onDone();
            resolve();
          }, 0);
        }),
    );

    const firstRun = startBilingualReading(loadedArticle);
    createBilingualSession();
    await firstRun;

    expect(bilingualArticles.get()[1].blocks[0]?.translatedText || "").not.toContain(
      "late chunk",
    );
  });

  it("resumes translation after closing bilingual mode during an in-flight request", async () => {
    let releaseStaleRequest;
    let callCount = 0;
    vi.mocked(translateTextStream).mockImplementation(
      (_text, { onChunk, onDone }) =>
        new Promise((resolve) => {
          callCount += 1;
          if (callCount === 1) {
            releaseStaleRequest = () => {
              onChunk("stale chunk");
              onDone();
              resolve();
            };
            return;
          }

          onChunk("fresh chunk");
          onDone();
          resolve();
        }),
    );

    startBilingualReading(loadedArticle);

    await vi.waitFor(() => {
      expect(translateTextStream).toHaveBeenCalledTimes(1);
    });

    stopBilingualReading(1);
    await startBilingualReading(loadedArticle);

    expect(translateTextStream).toHaveBeenCalledTimes(2);
    expect(bilingualArticles.get()[1].translationStatus).toBe("done");
    expect(bilingualArticles.get()[1].blocks[0]?.translatedText).toBe(
      "fresh chunk",
    );

    releaseStaleRequest?.();
    expect(bilingualArticles.get()[1].blocks[0]?.translatedText).toBe(
      "fresh chunk",
    );
  });

  it("limits concurrent translation requests", async () => {
    const concurrency = getTranslationConcurrency();
    let active = 0;
    let maxActive = 0;

    vi.mocked(translateTextStream).mockImplementation(
      (_text, { onDone }) =>
        new Promise((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          setTimeout(() => {
            active -= 1;
            onDone?.();
            resolve();
          }, 20);
        }),
    );

    const html = Array.from(
      { length: concurrency + 2 },
      (_, index) =>
        `<p>这是第 ${index} 段需要翻译的中文正文，内容足够长以触发并发翻译请求。</p>`,
    ).join("");

    await startBilingualReading({
      ...loadedArticle,
      content: html,
    });

    expect(maxActive).toBeLessThanOrEqual(concurrency);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("retries after original becomes available without fetching in bilingual handler", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await startBilingualReading({
      id: 2,
      title: "Retry",
      content: "<p>rss</p>",
      shownOriginal: false,
    });
    expect(translateTextStream).not.toHaveBeenCalled();

    await retryBilingualOriginal({
      id: 2,
      title: "Retry",
      content: "<p>这是重新加载后需要翻译的中文正文内容，长度足够触发翻译流程。</p>",
      shownOriginal: true,
    });

    expect(translateTextStream).toHaveBeenCalled();
  });

  it("aborts concurrent translations and ignores stale updates after stop", async () => {
    const concurrency = getTranslationConcurrency();
    const releaseCalls = [];
    let startedCalls = 0;

    vi.mocked(translateTextStream).mockImplementation(
      (_text, { signal, onChunk, onDone }) =>
        new Promise((resolve) => {
          startedCalls += 1;
          const release = () => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            onChunk?.(`chunk-${startedCalls}`);
            onDone?.();
            resolve();
          };
          releaseCalls.push(release);
          signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
    );

    const html = Array.from(
      { length: concurrency + 2 },
      (_, index) =>
        `<p>这是第 ${index} 段需要翻译的中文正文，内容足够长以触发并发翻译请求。</p>`,
    ).join("");

    startBilingualReading({
      ...loadedArticle,
      content: html,
    });

    await vi.waitFor(() => {
      expect(translateTextStream).toHaveBeenCalledTimes(concurrency);
    });

    const callsBeforeStop = translateTextStream.mock.calls.length;
    const signals = translateTextStream.mock.calls.map((call) => call[1].signal);
    const snapshot = bilingualArticles.get()[1];

    stopBilingualReading(1);

    expect(signals.some((signal) => signal?.aborted)).toBe(true);
    expect(bilingualArticles.get()[1]?.active).toBe(false);

    for (const release of releaseCalls) {
      release();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(translateTextStream).toHaveBeenCalledTimes(callsBeforeStop);
    expect(bilingualArticles.get()[1]?.translationStatus).toBe(
      snapshot?.translationStatus,
    );
    expect(bilingualArticles.get()[1]?.translationStatus).not.toBe("done");
    expect(
      bilingualArticles
        .get()[1]
        ?.blocks?.map((block) => block.translatedText)
        .join(""),
    ).toBe(snapshot?.blocks?.map((block) => block.translatedText).join(""));
    expect(
      bilingualArticles.get()[1]?.blocks?.some(
        (block) => block.status === "done" || block.status === "error",
      ),
    ).not.toBe(true);
  });

  it("resolves in-flight workers when bilingual session is invalidated", async () => {
    vi.mocked(translateTextStream).mockImplementation(
      (_text, { signal, onDone }) =>
        new Promise((resolve) => {
          const finish = () => {
            onDone?.();
            resolve();
          };
          if (signal?.aborted) {
            finish();
            return;
          }
          signal?.addEventListener("abort", finish, { once: true });
        }),
    );

    const pending = startBilingualReading(loadedArticle);
    await vi.waitFor(() => {
      expect(translateTextStream).toHaveBeenCalled();
    });

    invalidateBilingualSession();
    await expect(pending).resolves.toBeUndefined();
    expect(bilingualArticles.get()[1].blocks[0]?.status).not.toBe("done");
  });

  it("reuses cached original content without requiring reader view flag again", async () => {
    initBilingualArticle(1);
    setOriginalLoaded(
      1,
      "<p>这是缓存下来的中文原文内容，长度足够触发翻译流程。</p>",
    );
    bilingualArticles.set({
      1: {
        ...bilingualArticles.get()[1],
        originalStatus: "loaded",
      },
    });

    vi.mocked(translateTextStream).mockImplementation(
      async (_text, { onDone }) => {
        onDone();
      },
    );

    await startBilingualReading({
      id: 1,
      title: "Hello",
      content: "<p>rss</p>",
      shownOriginal: false,
    });

    expect(translateTextStream).toHaveBeenCalled();
  });
});
