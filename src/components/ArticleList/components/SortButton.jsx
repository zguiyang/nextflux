import { Button, Dropdown, Label } from "@heroui/react";
import { ListFilter } from "lucide-react";
import { useStore } from "@nanostores/react";
import { useTranslation } from "react-i18next";
import {
  articleListSortOverride,
  setArticleListSortOverride,
} from "@/stores/articlesStore.js";
import { settingsState } from "@/stores/settingsStore.js";

const sortOptions = [
  {
    id: "published_at:desc",
    labelKey: "articleList.sortPublishedDesc",
    sortField: "published_at",
    sortDirection: "desc",
  },
  {
    id: "published_at:asc",
    labelKey: "articleList.sortPublishedAsc",
    sortField: "published_at",
    sortDirection: "asc",
  },
  {
    id: "created_at:desc",
    labelKey: "articleList.sortCreatedDesc",
    sortField: "created_at",
    sortDirection: "desc",
  },
  {
    id: "created_at:asc",
    labelKey: "articleList.sortCreatedAsc",
    sortField: "created_at",
    sortDirection: "asc",
  },
];

export default function SortButton() {
  const { t } = useTranslation();
  const $settings = useStore(settingsState);
  const $sortOverride = useStore(articleListSortOverride);
  const sortField = $sortOverride?.sortField || $settings.sortField;
  const sortDirection =
    $sortOverride?.sortDirection || $settings.sortDirection;
  const selectedKey = `${sortField}:${sortDirection}`;

  return (
    <Dropdown>
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        aria-label={t("articleList.sort")}
        title={t("articleList.sort")}
      >
        <ListFilter className="size-4 text-muted" />
      </Button>

      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={t("articleList.sort")}
          selectedKeys={new Set([selectedKey])}
          selectionMode="single"
          onSelectionChange={(values) => {
            const selected = sortOptions.find(
              (option) => option.id === values.currentKey,
            );
            if (selected) {
              setArticleListSortOverride({
                sortField: selected.sortField,
                sortDirection: selected.sortDirection,
              });
            }
          }}
        >
          {sortOptions.map((option) => (
            <Dropdown.Item
              id={option.id}
              key={option.id}
              textValue={t(option.labelKey)}
            >
              <Dropdown.ItemIndicator />
              <Label>{t(option.labelKey)}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
