import React, { useState } from "react";
import { AlertTriangle, Bug, CheckCircle, ShieldAlert, Siren, TestTube, CheckCircle2 } from "lucide-react";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState, Button, Toggle } from "./ui";

interface ErrorItem {
  id: string;
  timestamp: string;
  agent: string;
  type: "lint" | "compliance" | "test" | "runtime" | "security";
  message: string;
  file?: string;
  line?: number;
  resolved: boolean;
}

const TYPE_ICONS: Record<string, typeof Bug> = {
  lint: Bug,
  compliance: ShieldAlert,
  test: TestTube,
  runtime: Siren,
  security: AlertTriangle,
};

export function ErrorTracker() {
  const { t } = useI18n();
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [showResolved, setShowResolved] = useState(false);

  useWS({
    handlers: {
      error: (d) => {
        const err = d as unknown as ErrorItem;
        if (err?.id) setErrors((prev) => [err, ...prev].slice(0, 100));
      },
    },
  });

  const filtered = errors.filter((e) => {
    if (filter !== "ALL" && e.type !== filter) return false;
    if (!showResolved && e.resolved) return false;
    return true;
  });

  const activeCount = errors.filter((e) => !e.resolved).length;

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("errors.title")}
        description={t("page.privacy.desc")}
        icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        action={
          <Badge variant={activeCount > 0 ? "rose" : "emerald"} size="sm">
            {t("errors.active_count", { count: activeCount })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Controls: Filter Pills & Show Resolved Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            {["ALL", "lint", "compliance", "test", "runtime", "security"].map((f) => (
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

          <Toggle
            checked={showResolved}
            onChange={setShowResolved}
            label={t("errors.show_resolved")}
          />
        </div>

        {/* Errors List */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("errors.no_errors")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
            {filtered.map((err) => {
              const TypeIcon = TYPE_ICONS[err.type] || AlertTriangle;
              const isResolved = err.resolved;

              return (
                <div
                  key={err.id}
                  className={`p-3.5 rounded-xl border border-white/[0.06] transition-all space-y-2 ${
                    isResolved
                      ? "bg-white/[0.01] opacity-60"
                      : "bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-text-muted">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-mono font-semibold text-cyan-400">
                        @{err.agent}
                      </span>
                      <Badge variant="purple" size="sm" className="flex items-center gap-1">
                        <TypeIcon size={11} />
                        <span>{err.type}</span>
                      </Badge>
                      {err.file && (
                        <span className="font-mono text-[11px] text-text-muted">
                          {err.file}:{err.line}
                        </span>
                      )}
                    </div>
                    {isResolved && (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle size={12} />
                        {t("errors.resolved")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-rose-400 font-mono leading-relaxed break-words">
                    {err.message}
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
