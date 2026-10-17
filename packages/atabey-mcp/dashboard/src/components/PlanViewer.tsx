import React, { useState } from "react";
import { ChevronDown, ChevronUp, GitBranch, CheckCircle2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState, Button } from "./ui";

interface PlanTask {
  id: string;
  traceId: string;
  description: string;
  agent: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "FAILED";
  priority: string;
  dependencies: string[];
  createdAt?: string;
}

export function PlanViewer() {
  const { t } = useI18n();
  const { data: tasks, loading } = useApi<PlanTask[]>("/tasks", 5000);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const list = tasks || [];
  const filtered =
    statusFilter === "ALL" ? list : list.filter((t) => t.status === statusFilter);

  const stats = {
    total: list.length,
    pending: list.filter((t) => t.status === "PENDING").length,
    inProgress: list.filter((t) => t.status === "IN_PROGRESS").length,
    completed: list.filter((t) => t.status === "COMPLETED").length,
    blocked: list.filter((t) => t.status === "BLOCKED" || t.status === "FAILED").length,
  };

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("tasks.planner_title")}
        description={t("page.tasks.desc")}
        icon={<GitBranch className="w-5 h-5 text-cyan-400" />}
        action={
          <Badge variant="cyan" size="sm">
            {t("tasks.count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Top Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
            <span className="block text-xl font-bold font-mono text-text-primary">
              {stats.total}
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {t("tasks.total")}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <span className="block text-xl font-bold font-mono text-amber-400">
              {stats.pending}
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {t("tasks.pending")}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
            <span className="block text-xl font-bold font-mono text-blue-400">
              {stats.inProgress}
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {t("tasks.in_progress")}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <span className="block text-xl font-bold font-mono text-emerald-400">
              {stats.completed}
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {t("tasks.completed")}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center col-span-2 sm:col-span-1">
            <span className="block text-xl font-bold font-mono text-rose-400">
              {stats.blocked}
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {t("tasks.blocked")}
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
          {["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "FAILED"].map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "primary" : "ghost"}
              onClick={() => setStatusFilter(f)}
              className="uppercase"
            >
              {f === "ALL" ? t("common.all") : f.replace("_", " ")}
            </Button>
          ))}
        </div>

        {/* Task List */}
        {loading && !list.length ? (
          <EmptyState
            icon={<GitBranch className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("tasks.loading")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("tasks.no_tasks")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {filtered.slice(0, 50).map((task) => {
              const open = expandedTask === task.id;
              const isCompleted = task.status === "COMPLETED";
              const isBlocked = task.status === "BLOCKED" || task.status === "FAILED";
              const isInProgress = task.status === "IN_PROGRESS";

              return (
                <div
                  key={task.id}
                  onClick={() => setExpandedTask(open ? null : task.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    open
                      ? "bg-white/[0.04] border-brand-purple/30 shadow-md"
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-text-muted">
                        {task.traceId}
                      </span>
                      <span className="font-mono font-semibold text-cyan-400">
                        @{task.agent}
                      </span>
                      <Badge
                        variant={
                          isCompleted
                            ? "emerald"
                            : isBlocked
                            ? "rose"
                            : isInProgress
                            ? "cyan"
                            : "amber"
                        }
                        size="sm"
                      >
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-text-muted uppercase">
                        {task.priority}
                      </span>
                      {open ? (
                        <ChevronUp size={14} className="text-text-muted" />
                      ) : (
                        <ChevronDown size={14} className="text-text-muted" />
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    {task.description}
                  </p>

                  {open && (
                    <div className="pt-2.5 border-t border-white/[0.06] text-xs text-text-muted space-y-1.5 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span>{t("tasks.created")}:</span>
                        <span className="font-mono text-text-secondary">
                          {task.createdAt
                            ? new Date(task.createdAt).toLocaleString()
                            : t("tasks.unknown")}
                        </span>
                      </div>
                      {task.dependencies.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span>{t("tasks.depends_on")}:</span>
                          <span className="font-mono text-cyan-400">
                            {task.dependencies.join(", ")}
                          </span>
                        </div>
                      )}
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
