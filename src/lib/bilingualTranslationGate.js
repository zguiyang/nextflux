import { checkTranslationNeeded } from "@/api/openai.js";
import {
  extractTranslatableSample,
  LANGUAGE_DECISION,
  resolveArticleLanguageDecision,
} from "@/lib/bilingualLanguage.js";

export const GATE_ACTION = {
  SKIP: "skip",
  TRANSLATE: "translate",
  ABORT: "abort",
  ABORTED: "aborted",
};

export const runTranslationPrecheck = async (
  html,
  locale,
  { signal, precheck = checkTranslationNeeded } = {},
) => {
  const sample = extractTranslatableSample(html, 1000);
  if (!sample || sample.length < 12) {
    return {
      action: GATE_ACTION.ABORT,
      reason: "insufficient_sample",
      source: "rules",
    };
  }

  const precheckResult = await precheck({
    content: sample,
    targetLanguage: locale,
    signal,
  });

  if (precheckResult.aborted || signal?.aborted) {
    return { action: GATE_ACTION.ABORTED, reason: "precheck_aborted" };
  }

  if (precheckResult.error) {
    return {
      action: GATE_ACTION.ABORT,
      reason: precheckResult.invalid ? "precheck_invalid" : "precheck_failed",
      error: precheckResult.error,
      source: "precheck",
    };
  }

  if (!precheckResult.shouldTranslate) {
    return {
      action: GATE_ACTION.SKIP,
      reason: "precheck_same",
      source: "precheck",
      confidence: precheckResult.confidence,
    };
  }

  return {
    action: GATE_ACTION.TRANSLATE,
    reason: "precheck_translate",
    source: "precheck",
    confidence: precheckResult.confidence,
  };
};

export const resolveBilingualTranslationGate = async (
  html,
  locale,
  { signal, precheck = checkTranslationNeeded, decision } = {},
) => {
  const resolvedDecision =
    decision || resolveArticleLanguageDecision(html, locale);

  if (resolvedDecision.status === LANGUAGE_DECISION.SAME) {
    return { action: GATE_ACTION.SKIP, reason: resolvedDecision.reason, source: "rules" };
  }

  if (resolvedDecision.status === LANGUAGE_DECISION.DIFFERENT) {
    return {
      action: GATE_ACTION.TRANSLATE,
      reason: resolvedDecision.reason,
      source: "rules",
    };
  }

  return runTranslationPrecheck(html, locale, { signal, precheck });
};
