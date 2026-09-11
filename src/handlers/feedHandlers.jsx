import i18next from "i18next";
import { toast } from "sonner";
import minifluxAPI from "@/api/miniflux.js";
import { forceSyncWithWait } from "@/stores/syncStore.js";

export const handleRefresh = (feedId) => {
  if (!feedId) return;

  return toast.promise(
    (async () => {
      await minifluxAPI.refreshFeed(feedId);
      await forceSyncWithWait();
    })(),
    {
      loading: i18next.t("common.loading"),
      success: i18next.t("common.success"),
      error: i18next.t("common.error"),
    },
  );
};
