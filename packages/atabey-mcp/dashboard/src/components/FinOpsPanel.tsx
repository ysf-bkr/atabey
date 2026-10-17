import React, { useEffect, useState } from "react";
import { AlertTriangle, DollarSign, RefreshCw, ShieldAlert } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, EmptyState, ConfirmDialog } from "./ui";

interface BudgetState {
  team: string;
  monthlySpend: number;
  agentSpend: Record<string, number>;
  periodStart: string;
  periodEnd: string;
  blocked: boolean;
  blockReason: string | null;
  triggeredAlerts: number[];
  lastSync: string | null;
}

interface AgentBudgetResult {
  allowed: boolean;
  monthlySpend: number;
  monthlyBudget: number;
  agentSpend: number;
  agentMaxBudget: number;
  usagePercent: number;
  blocked: boolean;
  blockReason: string | null;
}

export function FinOpsPanel() {
  const { t } = useI18n();
  const [state, setState] = useState<BudgetState | null>(null);
  const [selectedAgent] = useState<string>("default");
  const [agentCheck, setAgentCheck] = useState<AgentBudgetResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const fetchState = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finops");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setState(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch budget state");
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const checkAgent = async (agent: string) => {
    try {
      const res = await fetch(`/api/finops/check?agent=${encodeURIComponent(agent)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setAgentCheck(json.data);
      }
    } catch {
      setAgentCheck(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/finops/reset", { method: "POST" });
      if (res.ok) {
        await fetchState();
      }
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedAgent && selectedAgent !== "default") checkAgent(selectedAgent);
  }, [selectedAgent, state]);

  const agents = state ? Object.keys(state.agentSpend) : [];
  const monthlyBudget = 100;
  const usagePercent =
    monthlyBudget > 0 && state ? (state.monthlySpend / monthlyBudget) * 100 : 0;

  return (
    <Card className="shadow-lg space-y-4">
      <CardHeader
        title={t("finops.manager_title")}
        description={`${t("finops.team")}: ${state?.team || "Production Engineering"}`}
        icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmResetOpen(true)}
              disabled={resetting}
            >
              {resetting ? t("finops.resetting") : t("finops.reset_btn")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchState}
              leftIcon={<RefreshCw size={13} />}
            >
              {t("common.refresh")}
            </Button>
          </div>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-5">
        {loading && !state ? (
          <EmptyState
            icon={<DollarSign className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("finops.loading")}
          />
        ) : error && !state ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <>
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    state?.blocked ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  ${state?.monthlySpend.toFixed(2) || "0.00"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("finops.monthly_spend_title")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    usagePercent > 80 ? "text-amber-400" : "text-cyan-400"
                  }`}
                >
                  {usagePercent.toFixed(1)}%
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("finops.usage_title")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {agents.length}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("finops.agents_title")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    state?.blocked ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {state?.blocked ? "BLOCKED" : "Active"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("finops.status_title")}
                </span>
              </div>
            </div>

            {/* Block Banner */}
            {state?.blocked && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <ShieldAlert size={16} />
                <span>
                  <strong>{t("finops.budget_blocked")}:</strong> {state.blockReason}
                </span>
              </div>
            )}

            {/* Threshold Alerts */}
            {state?.triggeredAlerts && state.triggeredAlerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {state.triggeredAlerts.map((th) => (
                  <Badge key={th} variant="amber" size="sm">
                    ⚠️ {t("finops.threshold_triggered", { threshold: th })}
                  </Badge>
                ))}
              </div>
            )}

            {/* Agent Spend Breakdown */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                {t("finops.breakdown_title")}
              </span>
              {agents.length === 0 ? (
                <div className="text-xs text-text-muted text-center py-4">
                  {t("finops.no_spend_yet")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const spend = state?.agentSpend[agent] || 0;
                    const agentMax = agentCheck?.agentMaxBudget || 50;
                    const agentPercent = agentMax > 0 ? (spend / agentMax) * 100 : 0;
                    const overLimit = agentPercent >= 100;

                    return (
                      <div
                        key={agent}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-cyan-400">
                              @{agent}
                            </span>
                            {overLimit && (
                              <Badge variant="rose" size="sm">
                                {t("finops.over_limit")}
                              </Badge>
                            )}
                            {agentPercent > 80 && !overLimit && (
                              <Badge variant="amber" size="sm">
                                {t("finops.warning")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[11px] text-text-muted">
                            <span>${spend.toFixed(3)}</span>
                            <span>{agentPercent.toFixed(1)}%</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              overLimit
                                ? "bg-rose-500"
                                : agentPercent > 80
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                            }`}
                            style={{ width: `${Math.min(agentPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Confirm Reset Dialog */}
      <ConfirmDialog
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false);
          handleReset();
        }}
        title={t("finops.reset_confirm_title")}
        message={t("finops.reset_confirm_msg")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        type="danger"
      />
    </Card>
  );
}
