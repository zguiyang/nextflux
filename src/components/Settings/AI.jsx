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
import { fetchAIModels, testAIConnection } from "@/api/openai.js";
import { RefreshCw } from "lucide-react";

export default function AI() {
  const { t } = useTranslation();
  const { aiApiKey, aiBaseUrl, aiModel, aiPrompt } = useStore(settingsState);
  const [localApiKey, setLocalApiKey] = useState(aiApiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(aiBaseUrl);
  const [localModel, setLocalModel] = useState(aiModel);
  const [localPrompt, setLocalPrompt] = useState(aiPrompt);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      const fetchedModels = await fetchAIModels({
        apiKey: localApiKey.trim(),
        baseUrl: localBaseUrl.trim(),
      });
      setModels(fetchedModels);
      if (!fetchedModels.length) {
        toast.error(t("settings.ai.noModels"));
        return;
      }
      toast.success(t("settings.ai.modelsLoaded", { count: fetchedModels.length }));
    } catch (error) {
      setModels([]);
      toast.error(error.message || t("settings.ai.fetchModelsFailed"));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testAIConnection({
        apiKey: localApiKey.trim(),
        baseUrl: localBaseUrl.trim(),
        model: localModel,
      });
      toast.success(t("settings.ai.connectionSuccess"));
    } catch (error) {
      toast.error(error.message || t("settings.ai.connectionFailed"));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      updateSettings({
        aiApiKey: localApiKey.trim(),
        aiBaseUrl: localBaseUrl.trim().replace(/\/+$/, ""),
        aiModel: localModel.trim(),
        aiPrompt: localPrompt,
      });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ItemWrapper title={t("settings.ai.openai")}>
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
            <Description>{t("settings.ai.description")}</Description>
          </TextField>
        </div>
        <Separator />
        <div className="bg-default/60 dark:bg-default/30 p-2.5 flex flex-col gap-3">
          {models.length > 0 && (
            <Select
              variant="secondary"
              value={models.includes(localModel) ? localModel : null}
              onChange={(value) => setLocalModel(value || "")}
            >
              <Label>{t("settings.ai.selectModel")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {models.map((model) => (
                    <ListBox.Item key={model} id={model} textValue={model}>
                      {model}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}
          <div className="flex items-end gap-2">
            <TextField variant="secondary" className="min-w-0 flex-1">
              <Label>{t("settings.ai.model")}</Label>
              <Input
                type="text"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </TextField>
            <Button
              variant="outline"
              onPress={handleFetchModels}
              isPending={loadingModels}
              className="shrink-0"
            >
              {!loadingModels && <RefreshCw className="size-4" />}
              {t("settings.ai.fetchModels")}
            </Button>
          </div>
          <Description>{t("settings.ai.modelDescription")}</Description>
        </div>
        <Separator />
        <div className="bg-default/60 dark:bg-default/30 p-2.5">
          <TextField variant="secondary">
            <Label>{t("settings.ai.prompt")}</Label>
            <TextArea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              rows={3}
            />
          </TextField>
        </div>
      </ItemWrapper>
      <div className="flex gap-2">
        <Button
          fullWidth
          variant="outline"
          onPress={handleTest}
          isPending={testing}
        >
          {testing && <Spinner color="current" size="sm" />}
          {t("settings.ai.testConnection")}
        </Button>
        <Button fullWidth onPress={handleSave} isPending={saving}>
          {saving && <Spinner color="current" size="sm" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
