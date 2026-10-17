import React, { useState } from "react";
import { ShieldAlert, ShieldCheck, DollarSign, Bot } from "lucide-react";
import { ApprovalCenterModal, ApprovalItem } from "../components/ApprovalCenterModal";
import { FinOpsBudgetCard } from "../components/FinOpsBudgetCard";
import { PIIComplianceCard } from "../components/PIIComplianceCard";
import { SpecialistAgentsGridCard } from "../components/SpecialistAgentsGridCard";
import { TokenCostsChartCard } from "../components/TokenCostsChartCard";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { StatCard, Button, PageHeader, Badge } from "../components/ui";

interface OverviewPageProps {
  onNavigate: (tabId: string) => void;
  showApprovalModal?: boolean;
  onToggleApprovalModal?: (show: boolean) => void;
}

interface AgentRow {
  status?: string;
}

export function OverviewPage({
  onNavigate,
  showApprovalModal,
  onToggleApprovalModal,
}: OverviewPageProps) {
  const { t } = useI18n();
  const { data: serverApprovals } = useApi<ApprovalItem[]>("/approvals", 4000);
  const { data: agentsData } = useApi<AgentRow[]>("/agents", 5000);
  const [localApprovalOpen, setLocalApprovalOpen] = useState(false);

  const pendingList = Array.isArray(serverApprovals)
    ? serverApprovals.filter((a) => a.status.toUpperCase() === "PENDING")
    : [];
  const pendingCount = pendingList.length;

  const isApprovalOpen =
    showApprovalModal !== undefined ? showApprovalModal : localApprovalOpen;
  const setApprovalOpen = (val: boolean) => {
    if (onToggleApprovalModal) {
      onToggleApprovalModal(val);
    } else {
      setLocalApprovalOpen(val);
    }
  };

  const activeAgentsCount = Array.isArray(agentsData)
    ? agentsData.filter((a) => a.status === "ACTIVE" || a.status === "READY").length
    : 13;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.overview.title")}
        description={t("page.overview.desc")}
        badge={
          <Badge variant="purple" size="md">
            v0.0.38
          </Badge>
        }
      />

      {/* Top Quick Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2k:grid-cols-4 gap-4 2k:gap-6">
        <StatCard
          title={t("stat.active_specialists")}
          value={`${activeAgentsCount} Agents`}
          subtitle={t("stat.active_specialists_sub")}
          icon={<Bot className="w-5 h-5" />}
          glow="purple"
        />
        <StatCard
          title={t("stat.governance_gate")}
          value="Fail-Closed"
          subtitle={t("stat.governance_gate_sub")}
          icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title={t("stat.pending_approvals")}
          value={pendingCount}
          subtitle={
            pendingCount > 0
              ? t("stat.pending_approvals_sub")
              : t("stat.pending_approvals_clear")
          }
          icon={
            <ShieldAlert
              className={`w-5 h-5 ${
                pendingCount > 0 ? "text-rose-400 animate-pulse" : "text-text-muted"
              }`}
            />
          }
          change={
            pendingCount > 0
              ? { value: t("stat.action_needed"), isPositive: false }
              : undefined
          }
          glow={pendingCount > 0 ? "purple" : "none"}
        />
        <StatCard
          title={t("stat.cost_efficiency")}
          value="99.2%"
          subtitle={t("stat.cost_efficiency_sub")}
          icon={<DollarSign className="w-5 h-5 text-cyan-400" />}
          glow="cyan"
        />
      </div>

      {/* Main 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <FinOpsBudgetCard onNavigate={() => onNavigate("finops")} />
        <SpecialistAgentsGridCard onNavigate={() => onNavigate("agents")} />
        <TokenCostsChartCard />
        <PIIComplianceCard onNavigate={() => onNavigate("security")} />
      </div>

      {/* Floating Re-Open Trigger if Modal is Closed & Pending requests exist */}
      {!isApprovalOpen && pendingCount > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            variant="danger"
            size="lg"
            className="shadow-2xl shadow-rose-900/40 animate-bounce"
            onClick={() => setApprovalOpen(true)}
            leftIcon={<ShieldAlert className="w-5 h-5" />}
          >
            <span>
              {t("hitl.title")} ({t("hitl.pending_badge", { count: pendingCount })})
            </span>
          </Button>
        </div>
      )}

      {/* Approval Center (Human-in-the-Loop) Modal Dialog */}
      <ApprovalCenterModal
        isOpen={isApprovalOpen}
        onClose={() => setApprovalOpen(false)}
      />
    </div>
  );
}
