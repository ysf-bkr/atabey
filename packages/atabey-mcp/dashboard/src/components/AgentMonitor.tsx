import React, { useState } from "react";
import { Bot, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState } from "./ui";

interface Agent {
  name: string;
  state: string;
  task: string;
  last_updated: string;
}

const ALL_AGENT_NAMES = [
  "manager",
  "security",
  "architect",
  "backend",
  "frontend",
  "quality",
  "database",
  "analyst",
  "mobile",
  "native",
  "devops",
  "explorer",
  "git",
];

export function AgentMonitor() {
  const { t } = useI18n();
  const { data: initial, loading, error } = useApi<Agent[]>("/agents", 5000);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useWS({
    handlers: {
      agent_update: (d) => {
        const u = d as unknown as Agent;
        if (u?.name) {
          setAgents((prev) => {
            const cleanName = u.name.replace("@", "");
            const exists = prev.some((a) => a.name.replace("@", "") === cleanName);
            if (exists) {
              return prev.map((a) =>
                a.name.replace("@", "") === cleanName ? { ...a, ...u } : a
              );
            }
            return [...prev, u];
          });
        }
      },
    },
  });

  const rawList = agents.length ? agents : Array.isArray(initial) ? initial : [];
  if (Array.isArray(initial) && agents.length === 0 && initial.length > 0) {
    setAgents(initial);
  }

  // Merge database state with the full list of 13 corporate agents
  const list = ALL_AGENT_NAMES.map((name) => {
    const existing = rawList.find((a) => a.name.replace("@", "") === name);
    if (existing) {
      return {
        ...existing,
        name,
      };
    }
    return {
      name,
      state: "READY",
      task: t("monitor.idle"),
      last_updated: new Date().toISOString(),
    };
  });

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("monitor.title")}
        description={t("page.agents.desc")}
        icon={<Bot className="w-5 h-5 text-brand-purple" />}
        action={
          <Badge variant="purple" size="sm">
            {t("monitor.count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6">
        {loading && !rawList.length ? (
          <EmptyState
            icon={<Bot className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("monitor.loading")}
          />
        ) : error && !rawList.length ? (
          <EmptyState
            icon={<Bot className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2k:grid-cols-3 gap-3">
            {list.map((a) => {
              const open = expanded === a.name;
              const isActive =
                a.state.toUpperCase() === "ACTIVE" || a.state.toUpperCase() === "READY";
              const isExecuting = a.state.toUpperCase() === "EXECUTING";

              return (
                <div
                  key={a.name}
                  onClick={() => setExpanded(open ? null : a.name)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    open
                      ? "bg-white/[0.04] border-brand-purple/40 shadow-md shadow-purple-950/20"
                      : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isExecuting
                            ? "bg-amber-400 animate-ping"
                            : isActive
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                            : "bg-text-muted"
                        }`}
                      />
                      <span className="font-mono text-sm font-semibold text-text-primary truncate">
                        @{a.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={isExecuting ? "amber" : isActive ? "emerald" : "neutral"}
                        size="sm"
                      >
                        {a.state}
                      </Badge>
                      {open ? (
                        <ChevronUp size={14} className="text-text-muted" />
                      ) : (
                        <ChevronDown size={14} className="text-text-muted" />
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 text-xs text-text-secondary line-clamp-1">
                    <span className="text-text-muted mr-1.5 font-medium">
                      {t("monitor.task_label")}:
                    </span>
                    <span>{a.task || t("monitor.idle")}</span>
                  </div>

                  {open && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] text-xs text-text-muted flex items-center justify-between animate-in fade-in">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {t("monitor.updated_label")}:
                      </span>
                      <span className="font-mono">
                        {new Date(a.last_updated).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
