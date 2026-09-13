import { memo } from "react";
import { Button, Spinner } from "@heroui/react";
import ArticleContentBody from "@/components/ArticleView/components/ArticleContentBody.jsx";

function BilingualBlock({
  block,
  translationStatus,
  onRetryTranslation,
  t,
}) {
  return (
    <div className="bilingual-block flex flex-col gap-2">
      <ArticleContentBody html={block.html} />
      {!block.skipTranslation && (
        <div className="bilingual-translation rounded-xl bg-default/50 px-3 py-2 text-sm text-muted leading-relaxed">
          {block.status === "pending" && translationStatus === "translating" && (
            <div className="flex items-center gap-2">
              <Spinner size="sm" color="current" />
              <span>{t("articleView.bilingualWaiting")}</span>
            </div>
          )}
          {block.status === "translating" && (
            <div className="flex items-start gap-2">
              {block.translatedText ? (
                <span>{block.translatedText}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" color="current" />
                  <span>{t("articleView.bilingualTranslating")}</span>
                </div>
              )}
              {block.translatedText && (
                <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse align-middle shrink-0" />
              )}
            </div>
          )}
          {block.status === "done" && block.translatedText && (
            <span>{block.translatedText}</span>
          )}
          {block.status === "error" && (
            <div className="flex items-center gap-2 text-danger">
              <span>
                {block.error || t("articleView.bilingualTranslationFailed")}
              </span>
              <Button size="sm" variant="outline" onPress={onRetryTranslation}>
                {t("common.retry")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(
  BilingualBlock,
  (prev, next) =>
    prev.translationStatus === next.translationStatus &&
    prev.block.id === next.block.id &&
    prev.block.html === next.block.html &&
    prev.block.skipTranslation === next.block.skipTranslation &&
    prev.block.status === next.block.status &&
    prev.block.translatedText === next.block.translatedText &&
    prev.block.error === next.block.error,
);
