import { useStore } from "@nanostores/react";
import { Button } from "@heroui/react";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import BilingualBlock from "@/components/ArticleView/components/BilingualBlock.jsx";
import { bilingualArticles } from "@/stores/bilingualStore.js";
import {
  retryBilingualOriginal,
  retryBilingualTranslation,
  stopBilingualReading,
} from "@/handlers/bilingualHandlers.js";
import { activeArticle, loadingOriginContent } from "@/stores/articlesStore.js";

export default function BilingualContent({ articleId }) {
  const { t } = useTranslation();
  const $activeArticle = useStore(activeArticle);
  const isLoadingOriginal = useStore(loadingOriginContent);
  const state = useStore(bilingualArticles)[articleId];

  if (!state?.active) {
    return null;
  }

  const handleClose = () => {
    stopBilingualReading(articleId);
  };

  const handleRetry = () => {
    if ($activeArticle) {
      retryBilingualOriginal($activeArticle);
    }
  };

  const handleRetryTranslation = () => {
    if ($activeArticle) {
      retryBilingualTranslation($activeArticle);
    }
  };

  return (
    <div className="bilingual-content flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Languages className="size-4 text-accent shrink-0" />
        <span className="text-sm font-medium text-accent">
          {t("articleView.bilingualMode")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onPress={handleClose}
        >
          {t("articleView.bilingualClose")}
        </Button>
      </div>

      {isLoadingOriginal && (
        <p className="text-sm text-muted py-2">
          {t("articleView.bilingualLoadingOriginal")}
        </p>
      )}

      {state.originalStatus === "error" && (
        <div className="flex items-center gap-2 text-sm text-danger py-2">
          <span>
            {state.originalError || t("articleView.bilingualOriginalFailed")}
          </span>
          <Button size="sm" variant="outline" onPress={handleRetry}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {state.originalStatus === "loaded" &&
        state.translationStatus === "already_target_language" && (
          <p className="text-sm text-muted py-2">
            {t("articleView.bilingualAlreadyTargetLanguage")}
          </p>
        )}

      {state.originalStatus === "loaded" &&
        state.translationStatus !== "already_target_language" && (
          <>
            {state.translationStatus === "error" &&
              !state.blocks.some((block) => block.status === "error") && (
                <div className="flex items-center gap-2 text-sm text-danger py-2">
                  <span>
                    {state.translationError ||
                      t("articleView.bilingualTranslationFailed")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={handleRetryTranslation}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              )}

            <div className="flex flex-col gap-6">
              {state.blocks.map((block) => (
                <BilingualBlock
                  key={block.id}
                  block={block}
                  translationStatus={state.translationStatus}
                  onRetryTranslation={handleRetryTranslation}
                  t={t}
                />
              ))}
            </div>
          </>
        )}
    </div>
  );
}
