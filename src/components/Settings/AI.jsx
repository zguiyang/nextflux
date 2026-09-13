import { useStore } from "@nanostores/react";
import { settingsState, updateSettings } from "@/stores/settingsStore.js";
import {
  Button,
  Description,
  Input,
  Label,
  Separator,
  Spinner,
  TextField,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { ItemWrapper } from "@/components/ui/settingItem.jsx";
import { testAIConnection } from "@/api/openai.js";
import {
  SUMMARY_CAPABILITY,
  TRANSLATION_CAPABILITY,
  buildCapabilitySaveUpdates,
  fetchModelsForService,
  getCapabilityCardState,
  getPrimaryProvider,
  getUnsavedProviderCredentials,
} from "@/components/Settings/aiSettingsState.js";
import CapabilityCard from "@/components/Settings/CapabilityCard.jsx";
import { RefreshCw } from "lucide-react";

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
  const translationCard = getCapabilityCardState(settings, TRANSLATION_CAPABILITY);

  const [localApiKey, setLocalApiKey] = useState(primaryProvider?.apiKey || "");
  const [localBaseUrl, setLocalBaseUrl] = useState(
    primaryProvider?.baseUrl || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [summaryModelId, setSummaryModelId] = useState(summaryCard.modelId);
  const [summaryPrompt, setSummaryPrompt] = useState(
    summaryCard.promptContent,
  );
  const [translationModelId, setTranslationModelId] = useState(
    translationCard.modelId,
  );
  const [translationPrompt, setTranslationPrompt] = useState(
    translationCard.promptContent,
  );
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingSummary, setTestingSummary] = useState(false);
  const [testingTranslation, setTestingTranslation] = useState(false);
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

  const handleTestCapability = async (modelId, setTesting) => {
    setTesting(true);
    try {
      await testAIConnection({
        ...getUnsavedProviderCredentials(localApiKey, localBaseUrl),
        model: modelId,
      });
      toast.success(t("settings.ai.testSuccess"));
    } catch (error) {
      toast.error(error.message || t("settings.ai.testFailed"));
    } finally {
      setTesting(false);
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
            [TRANSLATION_CAPABILITY]: {
              modelId: translationModelId,
              promptContent: translationPrompt,
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
        <div className="flex flex-col gap-2">
          <CapabilityCard
            capability={SUMMARY_CAPABILITY}
            open={summaryOpen}
            onOpenChange={setSummaryOpen}
            modelId={summaryModelId}
            onModelIdChange={setSummaryModelId}
            prompt={summaryPrompt}
            onPromptChange={setSummaryPrompt}
            availableModels={availableModels}
            onTest={() => handleTestCapability(summaryModelId, setTestingSummary)}
            testing={testingSummary}
          />
          <CapabilityCard
            capability={TRANSLATION_CAPABILITY}
            open={translationOpen}
            onOpenChange={setTranslationOpen}
            modelId={translationModelId}
            onModelIdChange={setTranslationModelId}
            prompt={translationPrompt}
            onPromptChange={setTranslationPrompt}
            availableModels={availableModels}
            onTest={() =>
              handleTestCapability(translationModelId, setTestingTranslation)
            }
            testing={testingTranslation}
          />
        </div>
      </ItemWrapper>

      <Button fullWidth onPress={handleSave} isPending={saving}>
        {saving && <Spinner color="current" size="sm" />}
        {t("common.save")}
      </Button>
    </div>
  );
}
