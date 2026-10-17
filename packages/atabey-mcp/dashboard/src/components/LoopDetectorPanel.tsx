import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Shield, CheckCircle2 } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, EmptyState } from "./ui";

interface LoopAlert {
  type: "consecutive_same_tool" | "file_churn" | "oscillation" | "rate_limit" | "content_identity";
  severity: "warning" | "critical";
  agent: string;
  detail: string;
  timestamp: number;
  cooldownUntil: number | null;
}

interface AgentLoopStats {
  totalCalls: number;
  recentCalls: number;
  inCooldown: boolean;
  cooldownCount: number;
  consecutiveTools: Record<string, number>;
  fileWrites: Record<string, number>;
  fileReads: Record<string, number>;
  lastAlert: LoopAlert | null;
}

export function LoopDetectorPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Record<string, AgentLoopStats> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/loop-detector");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch loop stats");
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const clearCooldown = async (agent: string) => {
    setClearing(agent);
    try {
      const res = await fetch(`/api/loop-detector/clear/${encodeURIComponent(agent)}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setClearing(null);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const entries = Object.entries(data || {});
  const totalCooldowns = entries.reduce((sum, [, v]) => sum + v.cooldownCount, 0);
  const inCooldown = entries.filter(([, v]) => v.inCooldown).length;
  const totalAlerts = entries.filter(([, v]) => v.lastAlert !== null).length;

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("nav.loop")}
        description={t("page.settings.desc")}
        icon={<Shield className="w-5 h-5 text-amber-400" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            leftIcon={<RefreshCw size={13} />}
          >
            {t("common.refresh")}
          </Button>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-6">
        {loading && !data ? (
          <EmptyState
            icon={<Shield className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("common.loading")}
          />
        ) : error && !data ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <>
            {/* Top Stat Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {entries.length}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.active_agents")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    totalAlerts > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {totalAlerts}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("common.warning")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    inCooldown > 0 ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {inCooldown}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.active_cooldowns")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {totalCooldowns}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.total_violations")}
                </span>
              </div>
            </div>

            {/* Agent Loop Status List */}
            <div className="space-y-3 pt-2">
              {entries.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                  title={t("discipline.normal_status")}
                  description={t("hitl.safety_clear")}
                />
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {entries.map(([agent, stats]) => {
                    const alertType = stats.lastAlert?.type;
                    const alertSeverity = stats.lastAlert?.severity;

                    return (
                      <div
                        key={agent}
                        className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-cyan-400 text-sm">
                              @{agent}
                            </span>
                            {stats.inCooldown && (
                              <Badge variant="rose" size="sm">
                                Cooldown Active
                              </Badge>
                            )}
                            {alertType && !stats.inCooldown && (
                              <Badge
                                variant={alertSeverity === "critical" ? "rose" : "amber"}
                                size="sm"
                              >
                                {alertType}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-text-muted">
                              {stats.totalCalls} calls | {stats.cooldownCount} cooldowns
                            </span>
                            {stats.inCooldown && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={clearing === agent}
                                onClick={() => clearCooldown(agent)}
                              >
                                {clearing === agent ? "..." : t("common.clear")}
                              </Button>
                            )}
                          </div>
                        </div>

                        {stats.lastAlert && (
                          <p className="text-xs text-rose-400 font-mono">
                            {stats.lastAlert.detail}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
