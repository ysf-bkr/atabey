import { Check, CheckCircle2, X, KeyRound, ShieldAlert } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { Button, Input, Badge } from "./ui";

export interface ApprovalItem {
  id: string;
  traceId: string;
  actionTitle?: string;
  toolName?: string;
  agent?: string;
  riskScore?: number;
  riskLevel?: string;
  riskSummary?: string;
  riskAssessment?: string;
  description?: string;
  status: string;
  timestamp?: string;
}

interface ApprovalCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApprovalCenterModal({ isOpen, onClose }: ApprovalCenterModalProps) {
  const { t } = useI18n();
  const { data: serverApprovals, refetch } = useApi<ApprovalItem[]>("/approvals", 3000);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");

  if (!isOpen) return null;

  const pendingList = Array.isArray(serverApprovals)
    ? serverApprovals.filter((a) => a.status.toUpperCase() === "PENDING")
    : [];

  const activeItem = pendingList.length > 0 ? pendingList[0] : null;

  const handleAction = async (decision: "Approve" | "Reject") => {
    if (!activeItem) return;
    setIsSubmitting(true);
    try {
      const endpoint =
        decision === "Approve"
          ? `/api/approve/${activeItem.traceId}`
          : `/api/reject/${activeItem.traceId}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setToastMessage(decision === "Approve" ? t("hitl.approved_toast") : t("hitl.rejected_toast"));
      setTimeout(() => {
        setToastMessage(null);
        refetch();
        if (pendingList.length <= 1) {
          onClose();
        }
      }, 1000);
    } catch {
      setToastMessage(t("hitl.network_error"));
      setTimeout(() => setToastMessage(null), 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-background-surface/95 border border-brand-purple/30 rounded-2xl p-6 shadow-2xl shadow-purple-950/40 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary tracking-tight">
                {t("hitl.title")}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t("hitl.subtitle")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title={t("common.close")}
          >
            <X size={18} />
          </Button>
        </div>

        {toastMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
            <Check size={14} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        {activeItem ? (
          <div className="space-y-4">
            {/* Meta Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-text-muted">
                {t("hitl.trace")}: <strong className="text-text-primary">{activeItem.traceId}</strong>
              </span>
              <Badge variant="rose" size="sm">
                {activeItem.status}
              </Badge>
            </div>

            {/* Action Title */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <h4 className="text-sm font-semibold text-text-primary">
                {activeItem.actionTitle || activeItem.description || t("stat.action_needed")}
              </h4>
            </div>

            {/* Risk Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                <span className="text-[11px] text-text-muted block font-semibold uppercase">
                  {t("hitl.risk_summary")}
                </span>
                <span className="text-text-secondary leading-snug">
                  {activeItem.riskSummary || activeItem.description || t("stat.human_authorization_sub")}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                <span className="text-[11px] text-text-muted block font-semibold uppercase">
                  {t("hitl.risk_assessment")}
                </span>
                <span className="text-rose-400 font-medium">
                  {activeItem.riskAssessment || (activeItem.riskScore !== undefined ? `Risk: ${activeItem.riskScore}/100` : t("stat.governance_gate_sub"))}
                </span>
              </div>
            </div>

            {/* Actions & Passcode Input */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder={t("hitl.passcode_placeholder")}
                  leftIcon={<KeyRound size={14} />}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  onClick={() => handleAction("Approve")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t("hitl.submitting") : t("hitl.approve")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleAction("Reject")}
                  disabled={isSubmitting}
                >
                  {t("hitl.reject")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 size={44} className="text-emerald-400 mx-auto" />
            <h4 className="text-base font-semibold text-text-primary">
              {t("hitl.no_pending")}
            </h4>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              {t("hitl.safety_clear")}
            </p>
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
