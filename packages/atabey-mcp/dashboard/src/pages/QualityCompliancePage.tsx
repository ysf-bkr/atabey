import React from "react";
import { QualityPanel } from "../components/QualityPanel";
import { CompliancePanel } from "../components/CompliancePanel";
import { ErrorTracker } from "../components/ErrorTracker";
import { PageHeader, Badge } from "../components/ui";
import { useI18n } from "../i18n";

export function QualityCompliancePage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.quality.title")}
        description={t("page.quality.desc")}
        badge={
          <Badge variant="purple" size="md">
            {t("page.quality.badge")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <QualityPanel />
        <CompliancePanel />
      </div>

      <div className="w-full">
        <ErrorTracker />
      </div>
    </div>
  );
}
