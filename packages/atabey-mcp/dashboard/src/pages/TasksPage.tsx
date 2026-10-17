import React from "react";
import { PlanViewer } from "../components/PlanViewer";
import { LogViewer } from "../components/LogViewer";
import { PageHeader, Badge } from "../components/ui";
import { useI18n } from "../i18n";

export function TasksPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.tasks.title")}
        description={t("page.tasks.desc")}
        badge={
          <Badge variant="cyan" size="md">
            {t("page.tasks.badge")}
          </Badge>
        }
      />

      <div className="space-y-6">
        <PlanViewer />
        <LogViewer />
      </div>
    </div>
  );
}
