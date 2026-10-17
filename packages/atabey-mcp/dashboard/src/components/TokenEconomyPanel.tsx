import React, { useEffect, useState } from "react";
import { AlertTriangle, Cpu, RefreshCw } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Button, EmptyState } from "./ui";

interface MetricEntry {
  timestamp: string;
  agent: string;
  action: string;
  estimatedTokens: number;
  error?: string;
}

interface MetricsResponse {
  success: boolean;
  data: {
    totalToolCalls: number;
    totalEstimatedTokens: number;
    totalEstimatedCost: number;
    byAgent: Record<string, { calls: number; tokens: number; cost: number }>;
    byAction: Record<string, { calls: number; tokens: number }>;
    recentEntries: MetricEntry[];
  };
}

// (removed unused COST_PER_1K_TOKENS constant)

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatCost(cents: number): string {
  if (cents < 1) return "< $0.01";
  return `$${cents.toFixed(2)}`;
}

export function TokenEconomyPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<MetricsResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"tokens" | "calls">("tokens");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch metrics");
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
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const metrics = data;
  const agentList = metrics
    ? Object.entries(metrics.byAgent).sort((a, b) =>
        sortBy === "tokens" ? b[1].tokens - a[1].tokens : b[1].calls - a[1].calls
      )
    : [];

  const maxTokens = Math.max(...agentList.map(([, v]) => v.tokens), 1);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("token_economy.title")}
        description={t("token_economy.subtitle")}
        icon={<Cpu className="w-5 h-5 text-cyan-400" />}
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
        {loading && !metrics ? (
          <EmptyState
            icon={<Cpu className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("token_economy.loading")}
          />
        ) : error && !metrics ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <>
            {/* Top Stats Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {formatNumber(metrics?.totalToolCalls || 0)}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("token_economy.total_tool_calls")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-amber-400">
                  {formatNumber(metrics?.totalEstimatedTokens || 0)}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("token_economy.est_tokens")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-emerald-400">
                  {formatCost(metrics?.totalEstimatedCost || 0)}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("token_economy.est_cost")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {metrics?.totalEstimatedCost && metrics.totalEstimatedCost > 0
                    ? (metrics.totalToolCalls / metrics.totalEstimatedCost).toFixed(1)
                    : "N/A"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("token_economy.cost_efficiency")}
                </span>
              </div>
            </div>

            {/* Agent Token Breakdown */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  {t("token_economy.agent_consumption")}
                </span>
                <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <Button
                    size="sm"
                    variant={sortBy === "tokens" ? "primary" : "ghost"}
                    onClick={() => setSortBy("tokens")}
                  >
                    Tokens
                  </Button>
                  <Button
                    size="sm"
                    variant={sortBy === "calls" ? "primary" : "ghost"}
                    onClick={() => setSortBy("calls")}
                  >
                    Calls
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {agentList.map(([agent, stats]) => {
                  const width = (stats.tokens / maxTokens) * 100;
                  return (
                    <div
                      key={agent}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-cyan-400">
                          @{agent}
                        </span>
                        <div className="flex items-center gap-3 font-mono text-[11px] text-text-muted">
                          <span>{formatNumber(stats.tokens)} tok</span>
                          <span>{stats.calls} calls</span>
                          <span className="text-emerald-400 font-semibold">
                            {formatCost(stats.cost)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-purple to-cyan-400 transition-all duration-500"
                          style={{ width: `${Math.max(width, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
