// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  estimateTranslationMaxTokens,
  extractTranslatableSample,
  getTargetLanguageInstruction,
  isArticleSameLanguageAsTarget,
  isSameLanguageAsTarget,
  LANGUAGE_DECISION,
  normalizeAppLocale,
  resolveArticleLanguageDecision,
} from "./bilingualLanguage.js";

const realisticChineseArticleHtml = `<h2>背景介绍</h2>
<p>短注</p>
<p>这是深入分析苹果公司与 <a href="https://www.apple.com/iphone">iPhone</a> 生态的中文长文，结合 React 与 OpenAI 案例说明产业变化与读者应关注的核心趋势，版本号 v2.1.0 仅供参考。</p>
<ul><li>第一点说明产业格局</li><li>第二点分析技术演进路径</li></ul>`;

const englishHtml =
  "<p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>";

const frenchHtml =
  "<p>Cette introduction est écrite en français avec des mots comme le, la, les, pour, dans et avec pour confirmer la langue cible.</p>";

const turkishHtml =
  "<p>Bu paragraf Türkçe yazılmıştır ve bir, için, ile, daha gibi kelimeler içerir ve hedef dilin doğru tespit edilmesini sağlar.</p>";

const mixedHtml =
  "<p>这是中文段落，内容足够长以参与语言判断。</p><p>This is a long enough English paragraph with the and their words to detect the target language reliably.</p>";

describe("bilingualLanguage", () => {
  it("builds locale-specific runtime translation instructions", () => {
    expect(getTargetLanguageInstruction("zh-CN")).toContain("简体中文");
    expect(getTargetLanguageInstruction("en-US")).toContain("English");
    expect(getTargetLanguageInstruction("fr-FR")).toContain("français");
    expect(getTargetLanguageInstruction("tr-TR")).toContain("Türkçeye");
  });

  it("normalizes locale variants for detection", () => {
    expect(normalizeAppLocale("zh-cn")).toBe("zh-CN");
    expect(normalizeAppLocale("zh_CN")).toBe("zh-CN");
    expect(normalizeAppLocale("fr-fr")).toBe("fr-FR");
    expect(normalizeAppLocale("tr_tr")).toBe("tr-TR");
  });

  it("detects same-language articles for all supported locales", () => {
    expect(resolveArticleLanguageDecision(realisticChineseArticleHtml, "zh-CN").status).toBe(
      LANGUAGE_DECISION.SAME,
    );
    expect(resolveArticleLanguageDecision(englishHtml, "en-US").status).toBe(
      LANGUAGE_DECISION.SAME,
    );
    expect(resolveArticleLanguageDecision(frenchHtml, "fr-FR").status).toBe(
      LANGUAGE_DECISION.SAME,
    );
    expect(resolveArticleLanguageDecision(turkishHtml, "tr-TR").status).toBe(
      LANGUAGE_DECISION.SAME,
    );
  });

  it("distinguishes French and Turkish from English", () => {
    expect(resolveArticleLanguageDecision(frenchHtml, "en-US").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(resolveArticleLanguageDecision(turkishHtml, "en-US").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(resolveArticleLanguageDecision(englishHtml, "fr-FR").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(resolveArticleLanguageDecision(englishHtml, "tr-TR").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(isSameLanguageAsTarget(englishHtml, "fr-FR")).toBe(false);
    expect(isSameLanguageAsTarget(frenchHtml, "en-US")).toBe(false);
  });

  it("does not confuse French and Turkish through shared ç or ü", () => {
    expect(resolveArticleLanguageDecision(turkishHtml, "fr-FR").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(resolveArticleLanguageDecision(frenchHtml, "tr-TR").status).toBe(
      LANGUAGE_DECISION.DIFFERENT,
    );
    expect(isSameLanguageAsTarget(turkishHtml, "fr-FR")).toBe(false);
    expect(isSameLanguageAsTarget(frenchHtml, "tr-TR")).toBe(false);
  });

  it("marks mixed or short content as uncertain", () => {
    expect(resolveArticleLanguageDecision(mixedHtml, "zh-CN").status).toBe(
      LANGUAGE_DECISION.UNCERTAIN,
    );
    expect(resolveArticleLanguageDecision("<p>短</p>", "zh-CN").status).toBe(
      LANGUAGE_DECISION.UNCERTAIN,
    );
  });

  it("extracts filtered translatable samples for precheck", () => {
    const sample = extractTranslatableSample(realisticChineseArticleHtml, 1000);
    expect(sample).toContain("这是深入分析苹果公司");
    expect(sample).not.toContain("https://");
    expect(sample.length).toBeGreaterThan(20);
    expect(isArticleSameLanguageAsTarget(realisticChineseArticleHtml, "zh-CN")).toBe(
      true,
    );
  });

  it("estimates max tokens from input length with a safe cap", () => {
    expect(estimateTranslationMaxTokens("short")).toBe(128);
    expect(estimateTranslationMaxTokens("x".repeat(2000))).toBe(2000);
  });
});
