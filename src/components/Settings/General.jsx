import { settingsState, updateSettings } from "@/stores/settingsStore";
import {
  ArrowDownUp,
  CircleCheck,
  CircleDot,
  Eye,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@nanostores/react";
import {
  ItemWrapper,
  SelItem,
  SwitchItem,
} from "@/components/ui/settingItem.jsx";
import { Separator } from "@heroui/react";
import Language from "@/components/Settings/components/Language.jsx";
import { useTranslation } from "react-i18next";
import SettingIcon from "@/components/ui/SettingIcon";

export default function General() {
  const {
    sortDirection,
    sortField,
    showHiddenFeeds,
    markAsReadOnScroll,
    syncInterval,
    defaultExpandCategory,
    showUnreadByDefault,
  } = useStore(settingsState);
  const { t } = useTranslation();
  return (
    <>
      <Language />
      <ItemWrapper title={t("settings.general.sync")}>
        <SelItem
          label={t("settings.general.syncInterval")}
          icon={
            <SettingIcon variant="default">
              <RefreshCw />
            </SettingIcon>
          }
          settingName="syncInterval"
          settingValue={syncInterval}
          options={[
            { value: "0", label: t("settings.general.syncOff") },
            { value: "5", label: t("settings.general.sync5min") },
            { value: "15", label: t("settings.general.sync15min") },
            { value: "30", label: t("settings.general.sync30min") },
            { value: "60", label: t("settings.general.sync1hour") },
          ]}
        />
      </ItemWrapper>
      <ItemWrapper title={t("settings.general.feeds")}>
        <SwitchItem
          label={t("settings.general.showHiddenFeeds")}
          icon={
            <SettingIcon variant="purple">
              <Eye />
            </SettingIcon>
          }
          settingName="showHiddenFeeds"
          settingValue={showHiddenFeeds}
        />
        <Separator />
        <SwitchItem
          label={t("settings.general.defaultExpandCategory")}
          icon={
            <SettingIcon variant="blue">
              <FolderOpen />
            </SettingIcon>
          }
          settingName="defaultExpandCategory"
          settingValue={defaultExpandCategory}
        />
      </ItemWrapper>
      <ItemWrapper title={t("settings.general.articleList")}>
        <SelItem
          label={t("settings.general.sort")}
          icon={
            <SettingIcon variant="blue">
              <ArrowDownUp />
            </SettingIcon>
          }
          settingName="sortOrder"
          settingValue={`${sortField}:${sortDirection}`}
          options={[
            {
              value: "published_at:desc",
              label: t("settings.general.sortPublishedDesc"),
            },
            {
              value: "published_at:asc",
              label: t("settings.general.sortPublishedAsc"),
            },
            {
              value: "created_at:desc",
              label: t("settings.general.sortCreatedDesc"),
            },
            {
              value: "created_at:asc",
              label: t("settings.general.sortCreatedAsc"),
            },
          ]}
          onChange={(value) => {
            const [nextSortField, nextSortDirection] = value.split(":");
            updateSettings({
              sortField: nextSortField,
              sortDirection: nextSortDirection,
            });
          }}
        />
        <Separator />
        <SwitchItem
          label={t("settings.general.showUnreadByDefault")}
          description={t("settings.general.showUnreadByDefaultDescription")}
          icon={
            <SettingIcon variant="amber">
              <CircleDot className="p-1 fill-current" />
            </SettingIcon>
          }
          settingName="showUnreadByDefault"
          settingValue={showUnreadByDefault}
        />
        <Separator />
        <SwitchItem
          label={t("settings.general.markAsReadOnScroll")}
          icon={
            <SettingIcon variant="red">
              <CircleCheck />
            </SettingIcon>
          }
          settingName="markAsReadOnScroll"
          settingValue={markAsReadOnScroll}
        />
      </ItemWrapper>
    </>
  );
}
