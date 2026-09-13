// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  GATE_ACTION,
  resolveBilingualTranslationGate,
  runTranslationPrecheck,
} from "./bilingualTranslationGate.js";

const mixedHtml =
  "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>";

describe("bilingualTranslationGate", () => {
  it("returns skip for rule-detected same-language articles without precheck", async () => {
    const precheck = vi.fn();
    const result = await resolveBilingualTranslationGate(
      "<p>这是一段足够长的中文正文内容，用于判断是否已经处于目标语言。</p>",
      "zh-CN",
      { precheck },
    );

    expect(result.action).toBe(GATE_ACTION.SKIP);
    expect(precheck).not.toHaveBeenCalled();
  });

  it("returns translate for rule-detected foreign articles without precheck", async () => {
    const precheck = vi.fn();
    const result = await resolveBilingualTranslationGate(
      "<p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>",
      "zh-CN",
      { precheck },
    );

    expect(result.action).toBe(GATE_ACTION.TRANSLATE);
    expect(precheck).not.toHaveBeenCalled();
  });

  it("runs precheck only for uncertain articles", async () => {
    const precheck = vi.fn().mockResolvedValue({
      shouldTranslate: false,
      confidence: 0.98,
    });

    const result = await resolveBilingualTranslationGate(mixedHtml, "zh-CN", {
      precheck,
    });

    expect(precheck).toHaveBeenCalledTimes(1);
    expect(result.action).toBe(GATE_ACTION.SKIP);
    expect(result.source).toBe("precheck");
  });

  it("returns translate when precheck says translation is needed", async () => {
    const precheck = vi.fn().mockResolvedValue({
      shouldTranslate: true,
      confidence: 0.91,
    });

    const result = await runTranslationPrecheck(mixedHtml, "zh-CN", { precheck });

    expect(result.action).toBe(GATE_ACTION.TRANSLATE);
  });

  it("aborts safely on invalid precheck responses", async () => {
    const precheck = vi.fn().mockResolvedValue({
      error: new Error("Invalid precheck response"),
      invalid: true,
    });

    const result = await runTranslationPrecheck(mixedHtml, "zh-CN", { precheck });

    expect(result.action).toBe(GATE_ACTION.ABORT);
    expect(result.reason).toBe("precheck_invalid");
  });

  it("supports aborting an in-flight precheck", async () => {
    const controller = new AbortController();
    const precheck = vi.fn().mockResolvedValue({ aborted: true });

    const result = await runTranslationPrecheck(mixedHtml, "zh-CN", {
      signal: controller.signal,
      precheck,
    });

    controller.abort();
    expect(result.action).toBe(GATE_ACTION.ABORTED);
  });
});
