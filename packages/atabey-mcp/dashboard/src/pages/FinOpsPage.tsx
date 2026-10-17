import React from "react";
import { DollarSign, Cpu, TrendingUp, Sparkles } from "lucide-react";
import { FinOpsPanel } from "../components/FinOpsPanel";
import { AgentBudgetPanel } from "../components/AgentBudgetPanel";
import { TokenEconomyPanel } from "../components/TokenEconomyPanel";
import { TokenCostsChartCard } from "../components/TokenCostsChartCard";
import { PageHeader, Badge, StatCard } from "../components/ui";
import { useI18n } from "../i18n";

export function FinOpsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.finops.title")}
        description={t("page.finops.desc")}
        badge={
          <Badge variant="cyan" size="md">
            {t("page.finops.badge")}
          </Badge>
        }
      />

      {/* FinOps Quick Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2k:grid-cols-4 gap-4 2k:gap-6">
        <StatCard
          title={t("stat.monthly_budget_limit")}
          value="$100.00"
          subtitle={t("stat.monthly_budget_sub")}
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title={t("stat.active_token_model")}
          value="cl100k BPE"
          subtitle={t("stat.active_token_model_sub")}
          icon={<Cpu className="w-5 h-5 text-brand-purple" />}
          glow="purple"
        />
        <StatCard
          title={t("stat.cache_efficiency")}
          value="99.4%"
          subtitle={t("stat.cache_efficiency_sub")}
          icon={<Sparkles className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title={t("stat.budget_health")}
          value="Normal"
          subtitle={t("stat.budget_health_sub")}
          icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
          glow="cyan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <TokenCostsChartCard />
        <FinOpsPanel />
      </div>

      <div className="w-full">
        <AgentBudgetPanel />
      </div>

      <div className="w-full">
        <TokenEconomyPanel />
      </div>
    </div>
  );
}
