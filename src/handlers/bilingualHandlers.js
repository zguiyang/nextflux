import { translateTextStream } from "@/api/openai.js";
import i18n from "@/i18n/index.js";
import { toast } from "sonner";
import {
  isSameLanguageAsTarget,
  LANGUAGE_DECISION,
  normalizeAppLocale,
  resolveArticleLanguageDecision,
} from "@/lib/bilingualLanguage.js";
import {
  GATE_ACTION,
  runTranslationPrecheck,
} from "@/lib/bilingualTranslationGate.js";
import { splitHtmlIntoBlocks } from "@/lib/articleContentBlocks.js";
import { loadingOriginContent } from "@/stores/articlesStore.js";
import {
  appendBlockTranslation,
  createBilingualSession,
  hasCompletedTranslation,
  initBilingualArticle,
  initTranslationBlocks,
  isSessionActive,
  setAlreadyTargetLanguage,
  setBilingualInactive,
  setBlockDone,
  setBlockError,
  setBlockTranslating,
  setOriginalLoaded,
  setTranslationDone,
  resetFailedBlocks,
  setTranslationTranslating,
  bilingualArticles,
} from "@/stores/bilingualStore.js";

const TRANSLATION_CONCURRENCY = 3;
const CHUNK_FLUSH_MS = 40;

let activeAbortController = null;

const abortActiveTranslation = () => {
  activeAbortController?.abort();
  activeAbortController = null;
};

export const invalidateBilingualSession = () => {
  abortActiveTranslation();
  createBilingualSession();
};

const resolveSourceContent = (article, state) => {
  if (state?.originalStatus === "loaded" && state.originalContent) {
    return { status: "loaded", content: state.originalContent };
  }
  if (article?.content) {
    return { status: "loaded", content: article.content };
  }
  return { status: "empty" };
};

const shouldStartTranslation = (state) =>
  !hasCompletedTranslation(state) &&
  state.translationStatus !== "translating" &&
  state.translationStatus !== "already_target_language";

const createBufferedChunkWriter = (
  articleId,
  blockIndex,
  sessionId,
  signal,
) => {
  let pending = "";
  let flushTimer = null;

  const isWritable = () =>
    isSessionActive(sessionId) && !signal?.aborted;

  const flush = () => {
    flushTimer = null;
    if (!pending) return;
    if (!isWritable()) {
      pending = "";
      return;
    }
    appendBlockTranslation(articleId, blockIndex, pending);
    pending = "";
  };

  return {
    push(chunk) {
      if (!isWritable()) return;
      pending += chunk;
      if (!flushTimer) {
        flushTimer = setTimeout(flush, CHUNK_FLUSH_MS);
      }
    },
    flushNow() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    },
    cancel() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = "";
    },
  };
};

const applyLanguageSkip = (blocks, locale) =>
  blocks.map((block) => {
    if (block.skipTranslation || !block.text) {
      return block;
    }
    if (isSameLanguageAsTarget(block.text, locale)) {
      return {
        ...block,
        skipTranslation: true,
        status: "done",
        translatedText: "",
      };
    }
    return block;
  });

const runBlockTranslation = (
  text,
  articleId,
  blockIndex,
  sessionId,
  targetLanguage,
  signal,
) =>
  new Promise((resolve, reject) => {
    const writer = createBufferedChunkWriter(
      articleId,
      blockIndex,
      sessionId,
      signal,
    );

    translateTextStream(text, {
      targetLanguage,
      signal,
      onChunk: (chunk) => {
        if (!isSessionActive(sessionId) || signal?.aborted) return;
        writer.push(chunk);
      },
      onDone: () => {
        writer.flushNow();
        if (!isSessionActive(sessionId) || signal?.aborted) {
          writer.cancel();
          resolve();
          return;
        }
        setBlockDone(articleId, blockIndex);
        resolve();
      },
      onError: (error) => {
        writer.flushNow();
        if (!isSessionActive(sessionId) || signal?.aborted) {
          writer.cancel();
          resolve();
          return;
        }
        setBlockError(articleId, blockIndex, error.message);
        reject(error);
      },
    });
  });

const translateBlocksConcurrently = async (
  articleId,
  sessionId,
  targetLanguage,
  signal,
) => {
  const initialState = bilingualArticles.get()[articleId];
  if (!initialState || !shouldStartTranslation(initialState)) {
    return;
  }

  if (!isSessionActive(sessionId) || signal?.aborted) {
    return;
  }

  setTranslationTranslating(articleId);

  const pendingIndices = initialState.blocks
    .map((block, index) => ({ block, index }))
    .filter(
      ({ block }) => !block.skipTranslation && block.status !== "done",
    )
    .map(({ index }) => index);

  let nextQueueIndex = 0;
  let hadErrors = false;

  const worker = async () => {
    while (nextQueueIndex < pendingIndices.length) {
      if (!isSessionActive(sessionId) || signal?.aborted) {
        return;
      }

      const queueIndex = nextQueueIndex;
      nextQueueIndex += 1;
      const blockIndex = pendingIndices[queueIndex];
      const block = bilingualArticles.get()[articleId]?.blocks[blockIndex];

      if (!block || block.skipTranslation || block.status === "done") {
        continue;
      }

      if (!isSessionActive(sessionId) || signal?.aborted) {
        return;
      }

      setBlockTranslating(articleId, blockIndex);

      try {
        await runBlockTranslation(
          block.text,
          articleId,
          blockIndex,
          sessionId,
          targetLanguage,
          signal,
        );
      } catch {
        hadErrors = true;
      }
    }
  };

  await Promise.all(
    Array.from({ length: TRANSLATION_CONCURRENCY }, () => worker()),
  );

  if (!isSessionActive(sessionId) || signal?.aborted) {
    return;
  }

  const finalState = bilingualArticles.get()[articleId];
  const allFinished = finalState?.blocks.every(
    (block) =>
      block.skipTranslation || block.status === "done" || block.status === "error",
  );

  if (allFinished && !hadErrors) {
    setTranslationDone(articleId);
  }
};

const getAppLocale = () =>
  normalizeAppLocale(i18n.language || i18n.resolvedLanguage || "en-US");

const prepareTranslationBlocks = (articleId, originalContent) => {
  const locale = getAppLocale();
  const blocks = applyLanguageSkip(
    splitHtmlIntoBlocks(originalContent),
    locale,
  );
  initTranslationBlocks(articleId, blocks, originalContent);

  const translatableBlocks = blocks.filter((block) => !block.skipTranslation);
  if (translatableBlocks.length === 0 && blocks.length > 0) {
    setAlreadyTargetLanguage(articleId);
    return false;
  }

  return translatableBlocks.length > 0;
};

const startTranslationForArticle = async (
  articleId,
  sessionId,
  targetLanguage,
  signal,
) => {
  const state = bilingualArticles.get()[articleId];
  if (!state?.originalContent) {
    return;
  }

  if (hasCompletedTranslation(state)) {
    return;
  }

  if (state.translationStatus === "already_target_language") {
    return;
  }

  if (!state.blocks.length || state.originalContent !== state.splitSource) {
    const shouldTranslate = prepareTranslationBlocks(
      articleId,
      state.originalContent,
    );
    if (!shouldTranslate) {
      return;
    }
  }

  await translateBlocksConcurrently(
    articleId,
    sessionId,
    targetLanguage,
    signal,
  );
};

const syncOriginalContent = (article, articleId) => {
  const state = bilingualArticles.get()[articleId];
  const resolved = resolveSourceContent(article, state);

  if (resolved.status === "loaded") {
    setOriginalLoaded(articleId, resolved.content);
    return resolved.content;
  }

  return null;
};

const beginBilingualSession = () => {
  abortActiveTranslation();
  const sessionId = createBilingualSession();
  const abortController = new AbortController();
  activeAbortController = abortController;
  return { sessionId, abortController };
};

export const startBilingualReading = async (article) => {
  if (!article) return;
  if (loadingOriginContent.get()) return;

  const articleId = article.id;
  const existingState = bilingualArticles.get()[articleId];
  const resolved = resolveSourceContent(article, existingState);

  if (resolved.status !== "loaded") {
    return;
  }

  const locale = getAppLocale();
  const decision = resolveArticleLanguageDecision(resolved.content, locale);

  if (decision.status === LANGUAGE_DECISION.SAME) {
    toast.info(i18n.t("articleView.bilingualSameLanguageAsSystem"));
    return;
  }

  const { sessionId, abortController } = beginBilingualSession();

  if (decision.status === LANGUAGE_DECISION.UNCERTAIN) {
    const precheckResult = await runTranslationPrecheck(
      resolved.content,
      locale,
      { signal: abortController.signal },
    );

    if (!isSessionActive(sessionId) || abortController.signal.aborted) {
      return;
    }

    if (precheckResult.action === GATE_ACTION.ABORTED) {
      abortActiveTranslation();
      return;
    }

    if (precheckResult.action === GATE_ACTION.SKIP) {
      abortActiveTranslation();
      toast.info(i18n.t("articleView.bilingualSameLanguageAsSystem"));
      return;
    }

    if (precheckResult.action === GATE_ACTION.ABORT) {
      abortActiveTranslation();
      if (
        precheckResult.reason === "precheck_failed" &&
        precheckResult.error?.message
      ) {
        toast.error(precheckResult.error.message);
      } else {
        toast.info(i18n.t("articleView.bilingualPrecheckFailed"));
      }
      return;
    }
  }

  initBilingualArticle(articleId);

  const originalContent = syncOriginalContent(article, articleId);
  if (!originalContent || !isSessionActive(sessionId)) {
    return;
  }

  await startTranslationForArticle(
    articleId,
    sessionId,
    locale,
    abortController.signal,
  );
};

export const stopBilingualReading = (articleId) => {
  invalidateBilingualSession();
  if (articleId) {
    setBilingualInactive(articleId);
  }
};

export const retryBilingualOriginal = async (article) => {
  if (!article || loadingOriginContent.get()) return;

  abortActiveTranslation();
  const sessionId = createBilingualSession();
  const abortController = new AbortController();
  activeAbortController = abortController;

  const articleId = article.id;
  initBilingualArticle(articleId);

  const originalContent = syncOriginalContent(article, articleId);
  if (!originalContent || !isSessionActive(sessionId)) {
    return;
  }

  await startTranslationForArticle(
    articleId,
    sessionId,
    getAppLocale(),
    abortController.signal,
  );
};

export const retryBilingualTranslation = async (article) => {
  if (!article || loadingOriginContent.get()) return;

  abortActiveTranslation();
  const sessionId = createBilingualSession();
  const abortController = new AbortController();
  activeAbortController = abortController;

  const articleId = article.id;
  initBilingualArticle(articleId);

  const state = bilingualArticles.get()[articleId];
  if (state?.originalStatus !== "loaded" || !state.originalContent) {
    const originalContent = syncOriginalContent(article, articleId);
    if (!originalContent) {
      return;
    }
  }

  resetFailedBlocks(articleId);
  await startTranslationForArticle(
    articleId,
    sessionId,
    getAppLocale(),
    abortController.signal,
  );
};

export const toggleBilingualReading = async (article) => {
  if (!article) return;
  if (loadingOriginContent.get()) return;

  const state = bilingualArticles.get()[article.id];
  if (state?.active) {
    stopBilingualReading(article.id);
    return;
  }

  await startBilingualReading(article);
};

export const getTranslationConcurrency = () => TRANSLATION_CONCURRENCY;
