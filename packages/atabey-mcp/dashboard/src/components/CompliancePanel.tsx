import React, { useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, CheckCircle2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState, Button } from "./ui";

interface ComplianceResult {
  file: string;
  status: "PASS" | "FAIL" | "WARN";
  violations: string[];
}

export function CompliancePanel() {
  const { t } = useI18n();
  const { data: results, loading, error } = useApi<ComplianceResult[]>("/compliance", 15000);
  const [filter, setFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = Array.isArray(results) ? results : [];
  const filtered = filter === "ALL" ? list : list.filter((r) => r.status === filter);

  const stats = {
    PASS: list.filter((r) => r.status === "PASS").length,
    FAIL: list.filter((r) => r.status === "FAIL").length,
    WARN: list.filter((r) => r.status === "WARN").length,
  };

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("compliance.title")}
        description={t("page.quality.desc")}
        icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        action={
          <Badge variant="purple" size="sm">
            {t("compliance.files_count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {loading && !list.length ? (
          <EmptyState
            icon={<CheckCircle className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("compliance.running")}
          />
        ) : error && !list.length ? (
          <EmptyState
            icon={<XCircle className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-8 h-8 text-emerald-400" />}
            title={t("compliance.no_results")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <>
            {/* Quick Stat Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="block text-xl font-bold font-mono text-emerald-400">
                  {stats.PASS}
                </span>
                <span className="text-[11px] font-semibold text-text-muted uppercase">
                  PASS
                </span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <span className="block text-xl font-bold font-mono text-rose-400">
                  {stats.FAIL}
                </span>
                <span className="text-[11px] font-semibold text-text-muted uppercase">
                  FAIL
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="block text-xl font-bold font-mono text-amber-400">
                  {stats.WARN}
                </span>
                <span className="text-[11px] font-semibold text-text-muted uppercase">
                  WARN
                </span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
              {["ALL", "PASS", "FAIL", "WARN"].map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "primary" : "ghost"}
                  onClick={() => setFilter(f)}
                >
                  {f === "ALL" ? t("common.all") : f}
                </Button>
              ))}
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {filtered.map((r) => {
                const open = expanded === r.file;
                const isPass = r.status === "PASS";
                const isFail = r.status === "FAIL";

                return (
                  <div
                    key={r.file}
                    onClick={() => setExpanded(open ? null : r.file)}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] cursor-pointer transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {isPass ? (
                          <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                        ) : isFail ? (
                          <XCircle size={15} className="text-rose-400 shrink-0" />
                        ) : (
                          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                        )}
                        <span className="font-mono text-text-secondary truncate">
                          {r.file}
                        </span>
                      </div>
                      <Badge
                        variant={isPass ? "emerald" : isFail ? "rose" : "amber"}
                        size="sm"
                      >
                        {r.status}
                      </Badge>
                    </div>

                    {open && r.violations.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.06] space-y-1 animate-in fade-in">
                        {r.violations.map((v, i) => (
                          <div
                            key={i}
                            className="text-xs text-rose-400 flex items-start gap-1.5"
                          >
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
