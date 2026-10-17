import React, { useEffect, useState } from "react";
import { Activity, CheckCircle2 } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState } from "./ui";

interface QualityIssue {
  file: string;
  type: string;
  message: string;
}

interface QualityData {
  totalFiles: number;
  totalIssues: number;
  longFunctions: number;
  deepNesting: number;
  anyTypes: number;
  issues: QualityIssue[];
}

export function QualityPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuality = () => {
      fetch("/api/quality?path=src")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setData(d.data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchQuality();
    const interval = setInterval(fetchQuality, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("quality.title")}
        description={t("page.quality.desc")}
        icon={<Activity className="w-5 h-5 text-brand-purple" />}
        action={
          data ? (
            <Badge variant={data.totalIssues > 0 ? "amber" : "emerald"} size="sm">
              {t("quality.issues_count", { count: data.totalIssues })}
            </Badge>
          ) : undefined
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {loading && !data ? (
          <EmptyState
            icon={<Activity className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("quality.analyzing")}
          />
        ) : !data || data.issues.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("quality.no_issues")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    data.anyTypes > 0 ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {data.anyTypes}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("quality.any_types")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    data.longFunctions > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {data.longFunctions}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("quality.long_funcs")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    data.deepNesting > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {data.deepNesting}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("quality.deep_nesting")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {data.totalFiles}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("quality.files_scanned")}
                </span>
              </div>
            </div>

            {/* Issues List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {data.issues.map((issue, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-white/[0.02] border-l-4 border-l-amber-500 border border-white/[0.06] space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-text-muted truncate">
                      {issue.file}
                    </span>
                    <Badge variant="amber" size="sm">
                      {issue.type}
                    </Badge>
                  </div>
                  <p className="text-text-secondary leading-relaxed">
                    {issue.message}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
