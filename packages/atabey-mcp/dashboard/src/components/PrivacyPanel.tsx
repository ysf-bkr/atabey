import React, { useEffect, useState } from "react";
import { Clock, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, Input, EmptyState, ConfirmDialog, useToast } from "./ui";

interface AuditEntry {
  id?: number;
  timestamp: string;
  action: string;
  status: string;
  agent: string;
  traceId?: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  dataCategory?: string;
  retentionDays?: number;
}

interface AuditStats {
  total: number;
  byStatus: Record<string, number>;
  byAction: Record<string, number>;
  byCategory: Record<string, number>;
  expiredCount: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    stats: AuditStats;
    entries: AuditEntry[];
  };
}

export function PrivacyPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<{ stats: AuditStats; entries: AuditEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [erasing, setErasing] = useState(false);
  const [confirmErasureOpen, setConfirmErasureOpen] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      if (!res.ok) throw new Error("Failed to fetch privacy audit logs");
      const json: ApiResponse = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error("API returned failure status");
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
  }, []);

  const initiateErasure = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmationCode !== "KVKK-RIGHT-TO-ERASURE") {
      toast.error(t("privacy.erasure_code_error"));
      return;
    }
    setConfirmErasureOpen(true);
  };

  const executeErasure = async () => {
    setConfirmErasureOpen(false);
    setErasing(true);
    try {
      const res = await fetch("/api/audit/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationCode }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Audit records successfully erased", "Right to Erasure");
        setConfirmationCode("");
        fetchData();
      } else {
        throw new Error(json.error || "Erasure failed");
      }
    } catch (err) {
      toast.error((err as Error).message, "Erasure Failed");
    } finally {
      setErasing(false);
    }
  };

  const stats = data?.stats;
  const entries = data?.entries || [];
  const piiMaskedCount = stats?.byAction?.["MASK_PII"] || stats?.byAction?.["PII_MASKED"] || 0;
  const piiDetectedCount = stats?.byAction?.["PII_DETECTED"] || 0;
  const filteredEntries =
    categoryFilter === "ALL"
      ? entries
      : entries.filter((e) => e.dataCategory === categoryFilter);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("privacy.auditor_title")}
        description={t("privacy.auditor_desc")}
        icon={<ShieldCheck className="w-5 h-5 text-brand-purple" />}
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
            icon={<ShieldCheck className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("privacy.loading")}
          />
        ) : error && !data ? (
          <EmptyState
            icon={<ShieldAlert className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <>
            {/* Top Stat Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {stats?.total || 0}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("privacy.total_entries")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-emerald-400">
                  {piiMaskedCount}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("privacy.pii_masked")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-amber-400">
                  {piiDetectedCount}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("privacy.pii_detected")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {stats?.expiredCount || 0}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("privacy.retention_expired")}
                </span>
              </div>
            </div>

            {/* Right to Erasure Section */}
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-rose-400" />
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  {t("privacy.right_to_erasure")}
                </h4>
              </div>
              <p className="text-xs text-text-muted">
                {t("privacy.erasure_warning")}
              </p>
              <form onSubmit={initiateErasure} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    placeholder={t("privacy.confirm_code_prompt")}
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    size="sm"
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  type="submit"
                  disabled={erasing || !confirmationCode}
                  leftIcon={<Trash2 size={13} />}
                >
                  {erasing ? t("privacy.erasing") : t("privacy.execute_erasure")}
                </Button>
              </form>
            </div>

            {/* Audit Logs Stream */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  {t("privacy.audit_log_stream")}
                </span>
                {/* Category Filter */}
                <div className="flex flex-wrap gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  {["ALL", "USER_DATA", "SECURITY", "COMPLIANCE"].map((cat) => (
                    <Button
                      key={cat}
                      size="sm"
                      variant={categoryFilter === cat ? "primary" : "ghost"}
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {cat === "ALL" ? t("common.all") : cat}
                    </Button>
                  ))}
                </div>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="text-xs text-text-muted text-center py-6">
                  {t("privacy.no_entries")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {filteredEntries.slice(0, 50).map((entry, idx) => {
                    const open = expandedEntry === (entry.id ?? idx);
                    return (
                      <div
                        key={entry.id ?? idx}
                        onClick={() => setExpandedEntry(open ? null : (entry.id ?? idx))}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors space-y-2 cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                              <Clock size={11} />
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="font-mono font-semibold text-cyan-400">
                              @{entry.agent || "system"}
                            </span>
                            <Badge variant="purple" size="sm">
                              {entry.action}
                            </Badge>
                            {entry.dataCategory && (
                              <Badge variant="neutral" size="sm">
                                {entry.dataCategory}
                              </Badge>
                            )}
                          </div>
                          <Badge
                            variant={entry.status === "SUCCESS" ? "emerald" : "amber"}
                            size="sm"
                          >
                            {entry.status}
                          </Badge>
                        </div>

                        {open && entry.details && (
                          <div className="pt-2 border-t border-white/[0.06] text-xs font-mono bg-black/30 p-2 rounded-lg text-text-secondary overflow-x-auto">
                            <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                          </div>
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

      {/* Confirm Erasure Dialog */}
      <ConfirmDialog
        isOpen={confirmErasureOpen}
        onClose={() => setConfirmErasureOpen(false)}
        onConfirm={executeErasure}
        title={t("privacy.erasure_confirm_title")}
        message={t("privacy.erasure_confirm_msg")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        type="danger"
      />
    </Card>
  );
}
