import React from "react";
import { MemoryInsights } from "../components/MemoryInsights";
import { PageHeader, Badge } from "../components/ui";
import { useI18n } from "../i18n";

export function MemoryPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.memory.title")}
        description={t("page.memory.desc")}
        badge={
          <Badge variant="purple" size="md">
            {t("page.memory.badge")}
          </Badge>
        }
      />

      <div className="w-full">
        <MemoryInsights />
      </div>
    </div>
  );
}
