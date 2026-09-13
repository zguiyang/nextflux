import { splitHtmlIntoBlocks } from "@/lib/articleContentBlocks.js";

const TARGET_LANGUAGE_NAMES = {
  "zh-CN": "Simplified Chinese",
  "en-US": "English",
  "fr-FR": "French",
  "tr-TR": "Turkish",
};

const TARGET_LANGUAGE_INSTRUCTIONS = {
  "zh-CN": "将以下内容翻译为简体中文。只返回译文，不要解释。",
  "en-US": "Translate the following content into English. Return only the translation without explanations.",
  "fr-FR": "Traduisez le contenu suivant en français. Retournez uniquement la traduction, sans explication.",
  "tr-TR": "Aşağıdaki içeriği Türkçeye çevirin. Yalnızca çeviriyi döndürün, açıklama yapmayın.",
};

// Keep shared Latin characters such as ç and ü out of the language markers.
// They occur in both French and Turkish and must not identify either language
// on their own.
const FRENCH_MARKERS = /[àâäæéèêëïîôœùûÿ]/i;
const TURKISH_MARKERS = /[ğğıöşİ]/i;
const FRENCH_WORD_PATTERN =
  /\b(le|la|les|des|du|une|est|dans|pour|avec|que|qui|pas|plus|sur|cette|sont|nous|vous)\b/gi;
const TURKISH_WORD_PATTERN =
  /\b(ve|bir|bu|için|ile|de|da|den|olan|gibi|daha|çok|veya|kadar|ancak|olarak)\b/gi;
const ENGLISH_WORD_PATTERN =
  /\b(the|and|is|are|was|were|with|that|this|for|not|you|from|they|have|been|which|their|will|would)\b/gi;

const CANONICAL_LOCALES = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  en: "en-US",
  "en-us": "en-US",
  fr: "fr-FR",
  "fr-fr": "fr-FR",
  tr: "tr-TR",
  "tr-tr": "tr-TR",
};

const ARTICLE_LEVEL_THRESHOLDS = {
  zh: { cjkMin: 0.45, latinMax: 0.32 },
  en: { cjkMax: 0.08, latinMin: 0.65 },
};

const SUBSTANTIAL_BLOCK_MIN_LENGTH = 48;
const MIN_SAMPLE_LENGTH = 12;
const MIN_MEANINGFUL_CHARS = 10;

export const LANGUAGE_DECISION = {
  SAME: "same",
  DIFFERENT: "different",
  UNCERTAIN: "uncertain",
};

export const normalizeAppLocale = (locale) => {
  const raw = String(locale || "en-US").trim().replace(/_/g, "-");
  const lower = raw.toLowerCase();

  if (TARGET_LANGUAGE_NAMES[raw]) {
    return raw;
  }

  if (CANONICAL_LOCALES[lower]) {
    return CANONICAL_LOCALES[lower];
  }

  return raw;
};

const getLocaleBase = (locale) =>
  normalizeAppLocale(locale).split("-")[0]?.toLowerCase() || "en";

export const getTargetLanguageName = (locale) => {
  const normalized = normalizeAppLocale(locale);
  if (TARGET_LANGUAGE_NAMES[normalized]) {
    return TARGET_LANGUAGE_NAMES[normalized];
  }
  const base = getLocaleBase(normalized);
  if (base && TARGET_LANGUAGE_NAMES[`${base}-${base.toUpperCase()}`]) {
    return TARGET_LANGUAGE_NAMES[`${base}-${base.toUpperCase()}`];
  }
  return normalized || "English";
};

export const getTargetLanguageInstruction = (locale) => {
  const normalized = normalizeAppLocale(locale);
  return (
    TARGET_LANGUAGE_INSTRUCTIONS[normalized] ||
    `Translate the following content into ${getTargetLanguageName(normalized)}. Return only the translation without explanations.`
  );
};

export const stripDetectionNoise = (text) =>
  text
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/www\.[^\s]+/gi, " ")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, " ")
    .replace(/\bv?\d+(?:\.\d+){1,3}(?:-[a-z0-9.]+)?\b/gi, " ")
    .replace(/\b(?:v|version)\s*\d+(?:\.\d+)*\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const countScripts = (text) => {
  let cjk = 0;
  let latin = 0;
  let meaningful = 0;

  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      cjk += 1;
      meaningful += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      latin += 1;
      meaningful += 1;
      continue;
    }
    if (/[\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(char)) {
      meaningful += 1;
    }
  }

  return { cjk, latin, meaningful };
};

const countPatternMatches = (text, pattern) =>
  [...text.matchAll(pattern)].length;

const isClearlyLatin = ({ cjk, latin, meaningful }) =>
  latin / meaningful >= 0.7 && cjk / meaningful <= 0.05;

const isClearlyEnglish = (text) => {
  const lower = text.toLowerCase();
  const englishHits = countPatternMatches(lower, ENGLISH_WORD_PATTERN);
  const hasFrenchEvidence =
    FRENCH_MARKERS.test(text) ||
    countPatternMatches(lower, FRENCH_WORD_PATTERN) >= 2;
  const hasTurkishEvidence =
    TURKISH_MARKERS.test(text) ||
    countPatternMatches(lower, TURKISH_WORD_PATTERN) >= 2;

  return englishHits >= 2 && !hasFrenchEvidence && !hasTurkishEvidence;
};

const isClearlyFrench = (text) => {
  const lower = text.toLowerCase();
  return (
    FRENCH_MARKERS.test(text) ||
    countPatternMatches(lower, FRENCH_WORD_PATTERN) >= 2
  );
};

const isClearlyTurkish = (text) => {
  const lower = text.toLowerCase();
  return (
    TURKISH_MARKERS.test(text) ||
    countPatternMatches(lower, TURKISH_WORD_PATTERN) >= 2
  );
};

const getTranslatableBlocks = (html) =>
  splitHtmlIntoBlocks(html).filter(
    (block) => !block.skipTranslation && block.text?.trim(),
  );

export const extractTranslatableSample = (html, maxLength = 1000) => {
  const sample = stripDetectionNoise(
    getTranslatableBlocks(html)
      .map((block) => block.text.trim())
      .join(" "),
  );

  return sample.slice(0, maxLength);
};

const hasClearlyForeignBlock = (blocks, locale) => {
  const base = getLocaleBase(locale);

  return blocks.some((block) => {
    const text = block.text?.trim() || "";
    if (text.length < SUBSTANTIAL_BLOCK_MIN_LENGTH) {
      return false;
    }

    if (base === "zh") {
      return (
        isSameLanguageAsTarget(text, "en-US") ||
        isSameLanguageAsTarget(text, "fr-FR") ||
        isSameLanguageAsTarget(text, "tr-TR")
      );
    }

    if (base === "en") {
      return isSameLanguageAsTarget(text, "zh-CN");
    }

    if (base === "fr") {
      return (
        isSameLanguageAsTarget(text, "zh-CN") ||
        (isClearlyEnglish(text) && !isClearlyFrench(text)) ||
        (isClearlyTurkish(text) && !isClearlyFrench(text))
      );
    }

    if (base === "tr") {
      return (
        isSameLanguageAsTarget(text, "zh-CN") ||
        (isClearlyEnglish(text) && !isClearlyTurkish(text)) ||
        (isClearlyFrench(text) && !isClearlyTurkish(text))
      );
    }

    return false;
  });
};

const isClearlyDifferentFromTarget = (text, locale, { articleLevel = true } = {}) => {
  const sample = stripDetectionNoise(text?.trim() || "");
  if (sample.length < MIN_SAMPLE_LENGTH) {
    return false;
  }

  const base = getLocaleBase(locale);

  if (base === "zh") {
    return (
      isSameLanguageAsTarget(sample, "en-US", { articleLevel }) ||
      isSameLanguageAsTarget(sample, "fr-FR", { articleLevel }) ||
      isSameLanguageAsTarget(sample, "tr-TR", { articleLevel })
    );
  }

  if (base === "en") {
    return (
      isSameLanguageAsTarget(sample, "zh-CN", { articleLevel }) ||
      (isClearlyFrench(sample) && !isClearlyEnglish(sample)) ||
      (isClearlyTurkish(sample) && !isClearlyEnglish(sample))
    );
  }

  if (base === "fr") {
    return (
      isSameLanguageAsTarget(sample, "zh-CN", { articleLevel }) ||
      (isClearlyEnglish(sample) && !isClearlyFrench(sample)) ||
      (isClearlyTurkish(sample) && !isClearlyFrench(sample))
    );
  }

  if (base === "tr") {
    return (
      isSameLanguageAsTarget(sample, "zh-CN", { articleLevel }) ||
      (isClearlyEnglish(sample) && !isClearlyTurkish(sample)) ||
      (isClearlyFrench(sample) && !isClearlyTurkish(sample))
    );
  }

  return false;
};

const isAmbiguousLatinSample = (text, locale) => {
  const base = getLocaleBase(locale);
  if (base === "zh") {
    return false;
  }

  const sample = stripDetectionNoise(text?.trim() || "");
  const scripts = countScripts(sample);
  if (!isClearlyLatin(scripts)) {
    return false;
  }

  if (base === "en") {
    return (
      !isClearlyEnglish(sample) &&
      !isClearlyFrench(sample) &&
      !isClearlyTurkish(sample)
    );
  }

  if (base === "fr") {
    return !isClearlyFrench(sample) && !isClearlyEnglish(sample);
  }

  if (base === "tr") {
    return !isClearlyTurkish(sample) && !isClearlyEnglish(sample);
  }

  return false;
};

export const resolveArticleLanguageDecision = (html, locale) => {
  const normalizedLocale = normalizeAppLocale(locale);
  const blocks = getTranslatableBlocks(html);

  if (blocks.length === 0) {
    return { status: LANGUAGE_DECISION.UNCERTAIN, reason: "no_content" };
  }

  const aggregatedSample = extractTranslatableSample(html, Number.POSITIVE_INFINITY);

  if (aggregatedSample.length < MIN_SAMPLE_LENGTH) {
    return { status: LANGUAGE_DECISION.UNCERTAIN, reason: "too_short" };
  }

  if (
    isSameLanguageAsTarget(aggregatedSample, normalizedLocale, {
      articleLevel: true,
    })
  ) {
    return { status: LANGUAGE_DECISION.SAME, reason: "article_match" };
  }

  if (isClearlyDifferentFromTarget(aggregatedSample, normalizedLocale)) {
    return { status: LANGUAGE_DECISION.DIFFERENT, reason: "foreign_article" };
  }

  if (hasClearlyForeignBlock(blocks, normalizedLocale)) {
    return { status: LANGUAGE_DECISION.UNCERTAIN, reason: "mixed_blocks" };
  }

  if (isAmbiguousLatinSample(aggregatedSample, normalizedLocale)) {
    return { status: LANGUAGE_DECISION.UNCERTAIN, reason: "ambiguous_latin" };
  }

  return { status: LANGUAGE_DECISION.UNCERTAIN, reason: "unknown" };
};

export const isArticleSameLanguageAsTarget = (html, locale) =>
  resolveArticleLanguageDecision(html, locale).status === LANGUAGE_DECISION.SAME;

export const isSameLanguageAsTarget = (text, locale, options = {}) => {
  const { articleLevel = false } = options;
  const sample = stripDetectionNoise(text?.trim() || "");
  if (sample.length < MIN_SAMPLE_LENGTH) {
    return false;
  }

  const scripts = countScripts(sample);
  if (scripts.meaningful < MIN_MEANINGFUL_CHARS) {
    return false;
  }

  const base = getLocaleBase(locale);

  if (base === "zh") {
    const thresholds = articleLevel
      ? ARTICLE_LEVEL_THRESHOLDS.zh
      : { cjkMin: 0.55, latinMax: 0.1 };

    return (
      scripts.cjk / scripts.meaningful >= thresholds.cjkMin &&
      scripts.latin / scripts.meaningful <= thresholds.latinMax
    );
  }

  if (!isClearlyLatin(scripts)) {
    return false;
  }

  if (base === "en") {
    if (articleLevel) {
      const thresholds = ARTICLE_LEVEL_THRESHOLDS.en;
      return (
        scripts.latin / scripts.meaningful >= thresholds.latinMin &&
        scripts.cjk / scripts.meaningful <= thresholds.cjkMax &&
        isClearlyEnglish(sample)
      );
    }

    return isClearlyEnglish(sample);
  }

  if (base === "fr") {
    return isClearlyFrench(sample);
  }

  if (base === "tr") {
    return isClearlyTurkish(sample);
  }

  return false;
};

export const estimateTranslationMaxTokens = (text) => {
  const length = text?.length || 0;
  const estimated = Math.ceil(length * 1.4) + 64;
  return Math.min(2000, Math.max(128, estimated));
};
