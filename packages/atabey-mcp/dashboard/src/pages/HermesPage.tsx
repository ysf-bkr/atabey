import React from "react";
import { HermesBrokerView } from "../components/HermesBrokerView";
import { HermesStats } from "../components/HermesStats";
import { PageHeader, Badge } from "../components/ui";
import { useI18n } from "../i18n";

export function HermesPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.hermes.title")}
        description={t("page.hermes.desc")}
        badge={
          <Badge variant="cyan" size="md" pulse>
            {t("page.hermes.badge")}
          </Badge>
        }
      />

      <div className="space-y-6">
        <HermesStats />
        <HermesBrokerView />
      </div>
    </div>
  );
}
