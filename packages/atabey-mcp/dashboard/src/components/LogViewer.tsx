import React, { useState } from "react";
import { ScrollText, Clock, Hash, CheckCircle2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState, Select, Button } from "./ui";

interface LogEntry {
  id?: number;
  timestamp: string;
  agent: string;
  action: string;
  summary: string;
  traceId?: string;
  status?: string;
}

export function LogViewer() {
  const { t } = useI18n();
  const { data: initial, loading } = useApi<LogEntry[]>("/logs", 5000);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [agentFilter, setAgentFilter] = useState("ALL");

  useWS({
    handlers: {
      log: (d) => {
        const data = d as { logs: LogEntry[] };
        if (data?.logs) setLogs((prev) => [...data.logs, ...prev].slice(0, 200));
      },
    },
  });

  const list = logs.length ? logs : Array.isArray(initial) ? initial : [];
  if (Array.isArray(initial) && logs.length === 0 && initial.length > 0) {
    setLogs(initial);
  }

  const agents = [...new Set(list.map((l) => l.agent))].filter(Boolean);

  const filtered = list.filter((l) => {
    if (filter !== "ALL" && l.status !== filter && l.action !== filter) return false;
    if (agentFilter !== "ALL" && l.agent !== agentFilter) return false;
    return true;
  });

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("logs.title")}
        description={t("page.tasks.desc")}
        icon={<ScrollText className="w-5 h-5 text-cyan-400" />}
        action={
          <Badge variant="cyan" size="sm">
            {t("logs.entries_count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Controls: Agent dropdown and status filter pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <Select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              options={[
                { value: "ALL", label: t("logs.all_specialists") },
                ...agents.map((a) => ({ value: a, label: `@${a}` })),
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            {["ALL", "SUCCESS", "ERROR", "WARN", "INFO", "DEBUG"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "primary" : "ghost"}
                onClick={() => setFilter(f)}
                className="uppercase"
              >
                {f === "ALL" ? t("common.all") : f}
              </Button>
            ))}
          </div>
        </div>

        {/* Logs Stream */}
        {loading && !list.length ? (
          <EmptyState
            icon={<ScrollText className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("logs.loading")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("logs.no_logs")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.slice(0, 100).map((log, idx) => {
              const isError =
                log.status === "ERROR" || log.status === "FAIL" || log.status === "BLOCKED";
              const isSuccess = log.status === "SUCCESS" || log.status === "APPROVED";
              const isWarn = log.status === "WARN" || log.status === "PENDING";

              return (
                <div
                  key={log.id || idx}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-mono font-semibold text-cyan-400">
                        @{log.agent}
                      </span>
                      <Badge
                        variant={isError ? "rose" : isSuccess ? "emerald" : isWarn ? "amber" : "neutral"}
                        size="sm"
                      >
                        {log.status || log.action}
                      </Badge>
                    </div>
                    {log.traceId && (
                      <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                        <Hash size={11} />
                        {log.traceId}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed break-words">
                    <strong className="text-text-primary mr-1">{log.action}:</strong>
                    {log.summary}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
