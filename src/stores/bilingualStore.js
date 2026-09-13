import { atom } from "nanostores";

// { [articleId]: BilingualArticleState }
export const bilingualArticles = atom({});

let activeSessionId = 0;

export const createBilingualSession = () => {
  activeSessionId += 1;
  return activeSessionId;
};

export const getActiveSessionId = () => activeSessionId;

export const isSessionActive = (sessionId) => sessionId === activeSessionId;

const updateArticleState = (articleId, updater) => {
  const current = bilingualArticles.get();
  const prev = current[articleId];
  if (!prev) return;
  bilingualArticles.set({
    ...current,
    [articleId]: updater(prev),
  });
};

const resumeTranslationState = (prev) => {
  const blocks = (prev?.blocks || []).map((block) => {
    if (block.skipTranslation || block.status === "done") {
      return block;
    }

    return {
      ...block,
      status: "pending",
      error: null,
      translatedText: "",
    };
  });

  const translationComplete =
    blocks.length > 0 &&
    blocks.every((block) => block.skipTranslation || block.status === "done");

  return {
    blocks,
    splitSource: prev?.splitSource || null,
    translationStatus: translationComplete ? "done" : "idle",
    translationError: null,
  };
};

export const initBilingualArticle = (articleId) => {
  const current = bilingualArticles.get();
  const prev = current[articleId];
  const translation = resumeTranslationState(prev);

  bilingualArticles.set({
    ...current,
    [articleId]: {
      active: true,
      originalStatus: prev?.originalContent ? "loaded" : "idle",
      originalContent: prev?.originalContent || null,
      originalError: null,
      blocks: translation.blocks,
      splitSource: translation.splitSource,
      translationStatus: translation.translationStatus,
      translationError: translation.translationError,
      sessionId: activeSessionId,
    },
  });
};

export const setBilingualInactive = (articleId) => {
  const current = bilingualArticles.get();
  const prev = current[articleId];
  if (!prev) return;
  bilingualArticles.set({
    ...current,
    [articleId]: { ...prev, active: false },
  });
};

export const clearBilingualArticle = (articleId) => {
  const current = { ...bilingualArticles.get() };
  delete current[articleId];
  bilingualArticles.set(current);
};

export const setOriginalLoading = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    originalStatus: "loading",
    originalError: null,
  }));
};

export const setOriginalLoaded = (articleId, originalContent) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    originalStatus: "loaded",
    originalContent,
    originalError: null,
  }));
};

export const setOriginalError = (articleId, error) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    originalStatus: "error",
    originalError: error,
  }));
};

export const setNeedsOriginal = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    originalStatus: "needs_original",
    originalError: null,
  }));
};

export const setAlreadyTargetLanguage = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    translationStatus: "already_target_language",
    translationError: null,
  }));
};

export const initTranslationBlocks = (articleId, blocks, splitSource) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks,
    splitSource,
    translationStatus: "idle",
    translationError: null,
  }));
};

export const restoreTranslationCache = (articleId, blocks, splitSource) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: blocks.map((block) => ({
      ...block,
      status: "done",
      error: null,
    })),
    splitSource,
    translationStatus: "done",
    translationError: null,
  }));
};

export const setTranslationTranslating = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    translationStatus: "translating",
    translationError: null,
  }));
};

export const setBlockTranslating = (articleId, blockIndex) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: prev.blocks.map((block, index) =>
      index === blockIndex
        ? { ...block, status: "translating", error: null }
        : block,
    ),
  }));
};

export const appendBlockTranslation = (articleId, blockIndex, chunk) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: prev.blocks.map((block, index) =>
      index === blockIndex
        ? {
            ...block,
            translatedText: `${block.translatedText || ""}${chunk}`,
          }
        : block,
    ),
  }));
};

export const setBlockDone = (articleId, blockIndex) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: prev.blocks.map((block, index) =>
      index === blockIndex ? { ...block, status: "done" } : block,
    ),
  }));
};

export const setBlockError = (articleId, blockIndex, error) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: prev.blocks.map((block, index) =>
      index === blockIndex ? { ...block, status: "error", error } : block,
    ),
    translationStatus: "error",
    translationError: error,
  }));
};

export const setTranslationDone = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    translationStatus: "done",
    translationError: null,
  }));
};

export const setTranslationError = (articleId, error) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    translationStatus: "error",
    translationError: error,
  }));
};

export const resetFailedBlocks = (articleId) => {
  updateArticleState(articleId, (prev) => ({
    ...prev,
    blocks: prev.blocks.map((block) =>
      block.status === "error"
        ? {
            ...block,
            status: "pending",
            error: null,
            translatedText: "",
          }
        : block,
    ),
    translationStatus: "idle",
    translationError: null,
  }));
};

export const hasCompletedTranslation = (state) =>
  state?.translationStatus === "done" &&
  state.blocks.length > 0 &&
  state.blocks.every(
    (block) => block.skipTranslation || block.status === "done",
  );
