import { Check, CheckCircle2, X } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

export interface ApprovalItem {
    id: string;
    traceId: string;
    actionTitle: string;
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

    if (!isOpen) return null;

    const pendingList = Array.isArray(serverApprovals)
        ? serverApprovals.filter(a => a.status.toUpperCase() === "PENDING")
        : [];

    const activeItem = pendingList.length > 0 ? pendingList[0] : null;

    const handleAction = async (decision: "Approve" | "Reject") => {
        if (!activeItem) return;
        setIsSubmitting(true);
        try {
            const endpoint = decision === "Approve"
                ? `/api/approve/${activeItem.traceId}`
                : `/api/reject/${activeItem.traceId}`;
            const res = await fetch(endpoint, { method: "POST" });
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
            setToastMessage("Network error on action");
            setTimeout(() => setToastMessage(null), 1200);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="hitl-modal-backdrop animate-fade-in" onClick={onClose}>
            <div
                className="hitl-modal-card"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="hitl-modal-header">
                    <div className="hitl-header-text">
                        <h3 className="hitl-title">{t("hitl.title")}</h3>
                        <p className="hitl-subtitle">{t("hitl.subtitle")}</p>
                    </div>
                    <button
                        className="hitl-close-btn"
                        onClick={onClose}
                        title={t("common.close")}
                    >
                        <X size={18} />
                    </button>
                </div>

                {toastMessage && (
                    <div className="hitl-toast animate-fade-in">
                        <Check size={14} />
                        <span>{toastMessage}</span>
                    </div>
                )}

                {/* Body: Real Active Approval or Empty State */}
                {activeItem ? (
                    <div className="hitl-inner-card">
                        {/* Trace ID & Status Badge */}
                        <div className="hitl-meta-row">
                            <span className="hitl-trace-id">{t("hitl.trace")}: {activeItem.traceId}</span>
                            <span className="hitl-status-badge status-pending">
                                {activeItem.status}
                            </span>
                        </div>

                        {/* Action Title */}
                        <h2 className="hitl-action-title">
                            {activeItem.actionTitle || activeItem.description || "High Risk Operation"}
                        </h2>

                        {/* Risk Assessment Box */}
                        <div className="hitl-risk-box">
                            <div className="risk-col">
                                <span className="risk-label">{t("hitl.risk_summary")}</span>
                                <div className="risk-desc-item">
                                    <span className="risk-val">
                                        {activeItem.riskSummary || activeItem.description || "Requires explicit human sign-off"}
                                    </span>
                                </div>
                            </div>
                            <div className="risk-col">
                                <span className="risk-label">{t("hitl.risk_assessment")}</span>
                                <div className="risk-desc-item">
                                    <span className="risk-val">
                                        {activeItem.riskAssessment || (activeItem.riskScore !== undefined ? `Risk: ${activeItem.riskScore}/100` : "Evaluation gate")}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Primary Action Buttons */}
                        <div className="hitl-primary-actions-row">
                            <button
                                className="hitl-btn-approve"
                                onClick={() => handleAction("Approve")}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? t("hitl.submitting") : t("hitl.approve")}
                            </button>
                            <button
                                className="hitl-btn-reject"
                                onClick={() => handleAction("Reject")}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? t("hitl.submitting") : t("hitl.reject")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="hitl-inner-card text-center py-8">
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <CheckCircle2 size={44} className="text-emerald-400 mb-2" />
                            <h4 className="text-base font-semibold text-slate-200">
                                {t("hitl.no_pending")}
                            </h4>
                            <p className="text-xs text-slate-400 max-w-sm">
                                All agent tool invocations and mutating actions are running within automated safety policies.
                            </p>
                            <button
                                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors"
                                onClick={onClose}
                            >
                                {t("common.close")}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
