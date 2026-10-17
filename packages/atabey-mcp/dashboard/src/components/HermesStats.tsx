import React, { useEffect, useState } from "react";
import { Activity, BarChart3 } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState } from "./ui";

export function HermesStats() {
  const { t } = useI18n();
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/hermes/stats")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setStats(d.data);
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const CATEGORY_COLORS: Record<string, string> = {
    DELEGATION: "bg-blue-500",
    ACTION: "bg-amber-500",
    ALERT: "bg-rose-500",
    SUBTASK: "bg-purple-500",
    REPLY: "bg-emerald-500",
  };

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("hermes.queue_title")}
        description={t("page.hermes.desc")}
        icon={<BarChart3 className="w-5 h-5 text-cyan-400" />}
        action={
          stats ? (
            <Badge variant={stats.pending > 0 ? "cyan" : "neutral"} size="sm">
              {t("hermes.pending_total", { pending: stats.pending, total: stats.total })}
            </Badge>
          ) : undefined
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-6">
        {!stats ? (
          <EmptyState
            icon={<BarChart3 className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("hermes.loading_stats")}
          />
        ) : (
          <>
            {/* Category Breakdown */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-text-muted tracking-wider uppercase block">
                {t("hermes.by_category")}
              </span>
              <div className="space-y-2">
                {Object.entries(stats.byCategory).map(([cat, count]) => {
                  const maxCount = Math.max(...Object.values(stats.byCategory), 1);
                  const width = (count / maxCount) * 100;
                  const colorClass = CATEGORY_COLORS[cat] || "bg-slate-500";

                  return (
                    <div key={cat} className="flex items-center gap-3 text-xs">
                      <span className="w-24 font-mono font-medium text-text-secondary">
                        {cat}
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono font-semibold text-text-primary">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="space-y-3 pt-4 border-t border-white/[0.06]">
              <span className="text-[11px] font-bold text-text-muted tracking-wider uppercase block">
                {t("hermes.by_status")}
              </span>
              <div className="flex flex-wrap gap-2.5">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs flex items-center gap-2"
                  >
                    <span className="text-text-muted">{status}:</span>
                    <span className="font-mono font-semibold text-text-primary">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Queue Depth Gauge */}
            <div className="space-y-2 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-text-muted tracking-wider uppercase flex items-center gap-1.5">
                  <Activity size={13} className="text-cyan-400" />
                  {t("hermes.queue_depth")}
                </span>
                <span className="font-mono text-text-secondary">
                  {stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    stats.pending > 10
                      ? "bg-amber-400"
                      : stats.pending > 0
                      ? "bg-cyan-400"
                      : "bg-emerald-400"
                  }`}
                  style={{
                    width: `${Math.min((stats.pending / Math.max(stats.total, 1)) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
