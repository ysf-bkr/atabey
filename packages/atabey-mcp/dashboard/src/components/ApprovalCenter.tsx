import React, { useState } from "react";
import { Check, ShieldCheck, X, KeyRound, Clock, Hash } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, Input, EmptyState, useToast } from "./ui";

interface Approval {
  id: string;
  traceId: string;
  description: string;
  status: string;
  timestamp: string;
}

export function ApprovalCenter() {
  const { t } = useI18n();
  const toast = useToast();
  const { data: initial, refetch } = useApi<Approval[]>("/approvals", 5000);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [passcodes, setPasscodes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useWS({
    handlers: {
      approval: (d) => {
        const a = d as unknown as Approval;
        if (a?.id) {
          setApprovals((prev) => [a, ...prev]);
          toast.warning(`${t("hitl.title")}: ${a.traceId}`, "HITL Gate Triggered");
        }
      },
    },
  });

  const list = approvals.length ? approvals : Array.isArray(initial) ? initial : [];
  if (Array.isArray(initial) && approvals.length === 0 && initial.length > 0) {
    setApprovals(initial);
  }

  async function handleAction(traceId: string, action: "approve" | "reject") {
    setSubmittingId(traceId);
    try {
      const passcode = passcodes[traceId] || "";
      const endpoint = action === "approve" ? `/api/approve/${traceId}` : `/api/reject/${traceId}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (r.ok) {
        setApprovals((prev) =>
          prev.map((a) => (a.traceId === traceId ? { ...a, status: action === "approve" ? "APPROVED" : "REJECTED" } : a))
        );
        toast.success(
          action === "approve" ? t("hitl.approved_toast") : t("hitl.rejected_toast"),
          traceId
        );
        refetch();
      } else {
        toast.error(t("hitl.failed"), `HTTP ${r.status}`);
      }
    } catch {
      toast.error(t("hitl.network_error"));
    } finally {
      setSubmittingId(null);
    }
  }

  const pending = list.filter((a) => a.status === "PENDING");

  return (
    <Card className="border-brand-purple/20 shadow-xl overflow-hidden">
      <CardHeader
        title={t("hitl.gates_title")}
        description={t("hitl.subtitle")}
        icon={<ShieldCheck className="w-5 h-5 text-brand-purple" />}
        action={
          <Badge variant={pending.length > 0 ? "rose" : "neutral"} size="sm">
            {t("hitl.pending_overrides", { count: pending.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="w-8 h-8 text-emerald-400" />}
            title={t("hitl.no_approvals")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {list.map((a) => {
              const isPending = a.status === "PENDING";
              const isApproved = a.status === "APPROVED";

              return (
                <div
                  key={a.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isPending
                      ? "bg-rose-950/20 border-rose-500/30 shadow-lg shadow-rose-950/20"
                      : "bg-white/[0.02] border-white/[0.06] opacity-75"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-brand-purple" />
                      <span className="font-mono text-xs font-semibold text-text-primary">
                        {a.traceId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isPending ? "rose" : isApproved ? "emerald" : "neutral"}
                        size="sm"
                      >
                        {a.status}
                      </Badge>
                      <span className="text-[11px] text-text-muted flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(a.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                    {a.description}
                  </p>

                  {isPending && (
                    <div className="mt-3 pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="flex-1">
                        <Input
                          placeholder={t("hitl.passcode_placeholder")}
                          leftIcon={<KeyRound size={14} />}
                          value={passcodes[a.traceId] || ""}
                          onChange={(e) =>
                            setPasscodes({ ...passcodes, [a.traceId]: e.target.value })
                          }
                          size="sm"
                          disabled={submittingId === a.traceId}
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={submittingId === a.traceId}
                          onClick={() => handleAction(a.traceId, "approve")}
                          leftIcon={<Check size={14} />}
                        >
                          {submittingId === a.traceId ? t("hitl.submitting") : t("hitl.approve")}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={submittingId === a.traceId}
                          onClick={() => handleAction(a.traceId, "reject")}
                          leftIcon={<X size={14} />}
                        >
                          {t("hitl.reject")}
                        </Button>
                      </div>
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
