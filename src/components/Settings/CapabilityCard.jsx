import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Spinner,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { getCapabilityCardTitle } from "@/components/Settings/aiSettingsState.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.jsx";
import { ChevronDown } from "lucide-react";

export default function CapabilityCard({
  capability,
  open,
  onOpenChange,
  modelId,
  onModelIdChange,
  onModelSelect,
  maxOutputTokens,
  onMaxOutputTokensChange,
  enableReasoning,
  onEnableReasoningChange,
  prompt,
  onPromptChange,
  availableModels,
  onTest,
  testing,
}) {
  const { t } = useTranslation();

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="bg-default/60 dark:bg-default/30">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-2.5 py-3 text-left"
          >
            <span className="text-sm font-medium text-foreground">
              {getCapabilityCardTitle(capability, modelId, t)}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
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
                      availableModels.some((model) => model.id === modelId)
                        ? modelId
                        : null
                    }
                    onChange={(value) =>
                      (onModelSelect || onModelIdChange)(value || "")
                    }
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
                            key={model.id}
                            id={model.id}
                            textValue={model.id}
                          >
                            {model.id}
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
                  value={modelId}
                  onChange={(e) => onModelIdChange(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </TextField>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3 p-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.ai.reasoningMode")}
                </span>
                <span className="text-xs leading-4 text-muted">
                  {t("settings.ai.reasoningModeHint")}
                </span>
              </div>
              <Switch
                size="lg"
                className="shrink-0"
                isSelected={enableReasoning}
                onChange={onEnableReasoningChange}
                aria-label={t("settings.ai.reasoningMode")}
              >
                <Switch.Control className="rounded-full">
                  <Switch.Thumb className="rounded-full" />
                </Switch.Control>
              </Switch>
            </div>
            <Separator />
            <div className="p-2.5">
              <TextField variant="secondary">
                <Label>{t("settings.ai.maxOutputTokens")}</Label>
                <Input
                  type="number"
                  min="16"
                  step="1"
                  value={maxOutputTokens}
                  onChange={(e) => onMaxOutputTokensChange(e.target.value)}
                  placeholder="2048"
                />
              </TextField>
            </div>
            <Separator />
            <div className="p-2.5">
              <TextField variant="secondary">
                <Label>{t("settings.ai.prompt")}</Label>
                <TextArea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  rows={4}
                />
              </TextField>
            </div>
            <Separator />
            <div className="p-2.5">
              <Button
                variant="outline"
                fullWidth
                onPress={onTest}
                isPending={testing}
              >
                {testing && <Spinner color="current" size="sm" />}
                {t("settings.ai.testCapability")}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
