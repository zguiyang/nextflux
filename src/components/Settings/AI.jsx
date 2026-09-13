import { useStore } from "@nanostores/react";
import { settingsState, updateSettings } from "@/stores/settingsStore.js";
import {
  Button,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Spinner,
  TextArea,
  TextField,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { ItemWrapper } from "@/components/ui/settingItem.jsx";
import { testAIConnection } from "@/api/openai.js";
import {
  SUMMARY_CAPABILITY,
  buildCapabilitySaveUpdates,
  fetchModelsForService,
  getCapabilityCardState,
  getCapabilityCardTitle,
  getPrimaryProvider,
  getUnsavedProviderCredentials,
} from "@/components/Settings/aiSettingsState.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.jsx";
import { ChevronDown, RefreshCw } from "lucide-react";

export default function AI() {
  const { t } = useTranslation();
  const settings = useStore(settingsState);
  const { aiProviders, aiModels, aiCapabilities } = settings;

  const primaryProvider = getPrimaryProvider({
    aiProviders,
    aiModels,
    aiCapabilities,
  });
  const summaryCard = getCapabilityCardState(settings, SUMMARY_CAPABILITY);

  const [localApiKey, setLocalApiKey] = useState(primaryProvider?.apiKey || "");
  const [localBaseUrl, setLocalBaseUrl] = useState(
    primaryProvider?.baseUrl || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [summaryModelId, setSummaryModelId] = useState(summaryCard.modelId);
  const [summaryPrompt, setSummaryPrompt] = useState(
    summaryCard.promptContent,
  );
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingSummary, setTestingSummary] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      const result = await fetchModelsForService(
        getUnsavedProviderCredentials(localApiKey, localBaseUrl),
        availableModels,
      );
      setAvailableModels(result.models);
      if (result.status === "success") {
        toast.success(
          t("settings.ai.modelsLoaded", { count: result.models.length }),
        );
        return;
      }
      toast.info(t("settings.ai.fetchModelsFailed"));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestSummary = async () => {
    setTestingSummary(true);
    try {
      await testAIConnection({
        ...getUnsavedProviderCredentials(localApiKey, localBaseUrl),
        model: summaryModelId,
      });
      toast.success(t("settings.ai.testSuccess"));
    } catch (error) {
      toast.error(error.message || t("settings.ai.testFailed"));
    } finally {
      setTestingSummary(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      updateSettings(
        buildCapabilitySaveUpdates(settings, {
          apiKey: localApiKey,
          baseUrl: localBaseUrl,
          capabilities: {
            [SUMMARY_CAPABILITY]: {
              modelId: summaryModelId,
              promptContent: summaryPrompt,
            },
          },
        }),
      );
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ItemWrapper title={t("settings.ai.service")}>
        <div className="bg-default/60 dark:bg-default/30 p-2.5">
          <TextField variant="secondary">
            <Label>{t("settings.ai.apiKey")}</Label>
            <Input
              type="password"
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder={t("settings.ai.apiKeyPlaceholder")}
            />
          </TextField>
        </div>
        <Separator />
        <div className="bg-default/60 dark:bg-default/30 p-2.5">
          <TextField variant="secondary">
            <Label>{t("settings.ai.baseUrl")}</Label>
            <Input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </TextField>
        </div>
        <Separator />
        <div className="bg-default/60 dark:bg-default/30 p-2.5 flex flex-col gap-2">
          <Button
            variant="outline"
            onPress={handleFetchModels}
            isPending={loadingModels}
            className="w-fit"
          >
            {!loadingModels && <RefreshCw className="size-4" />}
            {t("settings.ai.fetchModels")}
          </Button>
          <Description>{t("settings.ai.fetchModelsHint")}</Description>
        </div>
      </ItemWrapper>

      <ItemWrapper title={t("settings.ai.capabilities")}>
        <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
          <div className="bg-default/60 dark:bg-default/30">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2.5 py-3 text-left"
              >
                <span className="text-sm font-medium text-foreground">
                  {getCapabilityCardTitle(
                    SUMMARY_CAPABILITY,
                    summaryModelId,
                    t,
                  )}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted transition-transform ${summaryOpen ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-visible">
              <div className="flex flex-col gap-0 border-t border-foreground/10">
                {availableModels.length > 0 && (
                  <>
                    <div className="p-2.5">
                      <Select
                        variant="secondary"
                        value={
                          availableModels.includes(summaryModelId)
                            ? summaryModelId
                            : null
                        }
                        onChange={(value) => setSummaryModelId(value || "")}
                      >
                        <Label>{t("settings.ai.selectModel")}</Label>
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {availableModels.map((model) => (
                              <ListBox.Item
                                key={model}
                                id={model}
                                textValue={model}
                              >
                                {model}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="p-2.5">
                  <TextField variant="secondary">
                    <Label>{t("settings.ai.model")}</Label>
                    <Input
                      type="text"
                      value={summaryModelId}
                      onChange={(e) => setSummaryModelId(e.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                  </TextField>
                </div>
                <Separator />
                <div className="p-2.5">
                  <TextField variant="secondary">
                    <Label>{t("settings.ai.prompt")}</Label>
                    <TextArea
                      value={summaryPrompt}
                      onChange={(e) => setSummaryPrompt(e.target.value)}
                      rows={4}
                    />
                  </TextField>
                </div>
                <Separator />
                <div className="p-2.5">
                  <Button
                    variant="outline"
                    fullWidth
                    onPress={handleTestSummary}
                    isPending={testingSummary}
                  >
                    {testingSummary && <Spinner color="current" size="sm" />}
                    {t("settings.ai.testCapability")}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </ItemWrapper>

      <Button fullWidth onPress={handleSave} isPending={saving}>
        {saving && <Spinner color="current" size="sm" />}
        {t("common.save")}
      </Button>
    </div>
  );
}
