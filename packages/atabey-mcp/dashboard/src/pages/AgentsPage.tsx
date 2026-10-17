import React, {  } from "react";
import { RefreshCw } from "lucide-react";
import { AgentMonitor } from "../components/AgentMonitor";
import { SpecialistAgentsGridCard } from "../components/SpecialistAgentsGridCard";
import { PageHeader, Badge, Button } from "../components/ui";
import { useI18n } from "../i18n";

export function AgentsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.agents.title")}
        description={t("page.agents.desc")}
        badge={
          <Badge variant="purple" size="md">
            {t("page.agents.badge", { count: 13 })}
          </Badge>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
            leftIcon={<RefreshCw size={14} />}
          >
            {t("monitor.sync_state")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 2k:grid-cols-2 gap-6 2k:gap-8">
        <SpecialistAgentsGridCard onNavigate={() => {}} />
        <AgentMonitor />
      </div>
    </div>
  );
}
