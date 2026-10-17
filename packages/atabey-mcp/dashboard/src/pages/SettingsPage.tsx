import React from "react";
import { MCPSetupPanel } from "../components/MCPSetupPanel";
import { AdapterSkillsPanel } from "../components/AdapterSkillsPanel";
import { LoopDetectorPanel } from "../components/LoopDetectorPanel";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { PageHeader, Badge } from "../components/ui";
import { useI18n } from "../i18n";

export function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.settings.title")}
        description={t("page.settings.desc")}
        badge={
          <Badge variant="cyan" size="md">
            {t("page.settings.badge")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <MCPSetupPanel />
        <AdapterSkillsPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <LoopDetectorPanel />
        <TelemetryPanel />
      </div>
    </div>
  );
}
