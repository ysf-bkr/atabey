import React, { useEffect, useState } from "react";
import { AlertTriangle, Ban, RefreshCw, CheckCircle2 } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, EmptyState } from "./ui";

interface AgentDisciplineStats {
  totalCalls: number;
  recentCalls: number;
  inCooldown: boolean;
  cooldownRemaining: number;
  violations: number;
  lastViolation: string | null;
}

export function DisciplinePanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Record<string, AgentDisciplineStats> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy] = useState<"violations" | "calls">("violations");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discipline");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch discipline stats");
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const entries = Object.entries(data || {}).sort((a, b) =>
    sortBy === "violations"
      ? b[1].violations - a[1].violations
      : b[1].totalCalls - a[1].totalCalls
  );

  const totalViolations = entries.reduce((acc, [, s]) => acc + s.violations, 0);
  const activeCooldowns = entries.filter(([, s]) => s.inCooldown).length;
  const totalCalls = entries.reduce((acc, [, s]) => acc + s.totalCalls, 0);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("discipline.title")}
        description={t("discipline.desc")}
        icon={<Ban className="w-5 h-5 text-rose-400" />}
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
            icon={<Ban className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("discipline.loading")}
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
                <span
                  className={`block text-xl font-bold font-mono ${
                    totalViolations > 0 ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {totalViolations}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.total_violations")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    activeCooldowns > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {activeCooldowns}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.active_cooldowns")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {totalCalls}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.total_invocations")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {entries.length}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("discipline.active_agents")}
                </span>
              </div>
            </div>

            {/* List of Agents and Cooldowns */}
            <div className="space-y-3 pt-2">
              {entries.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                  title={t("discipline.normal_status")}
                  description={t("hitl.safety_clear")}
                />
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {entries.map(([agent, stats]) => (
                    <div
                      key={agent}
                      className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-cyan-400 text-sm">
                          @{agent}
                        </span>
                        {stats.inCooldown ? (
                          <Badge variant="rose" size="sm">
                            {t("discipline.cooldown_active", {
                              seconds: stats.cooldownRemaining,
                            })}
                          </Badge>
                        ) : (
                          <Badge variant="emerald" size="sm">
                            {t("common.status")}: OK
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono text-text-muted">
                        <span>
                          {stats.totalCalls} {t("common.entries")}
                        </span>
                        <span
                          className={
                            stats.violations > 0 ? "text-rose-400 font-semibold" : "text-text-muted"
                          }
                        >
                          {stats.violations} {t("discipline.total_violations")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
