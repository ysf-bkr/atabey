import { ShieldAlert } from "lucide-react";
import React, { useState } from "react";
import { ApprovalCenterModal, ApprovalItem } from "./ApprovalCenterModal";
import { FinOpsBudgetCard } from "./FinOpsBudgetCard";
import { PIIComplianceCard } from "./PIIComplianceCard";
import { SpecialistAgentsGridCard } from "./SpecialistAgentsGridCard";
import { TokenCostsChartCard } from "./TokenCostsChartCard";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

interface AtabeyDashboardProps {
    onNavigate: (tabId: string) => void;
    showApprovalModal?: boolean;
    onToggleApprovalModal?: (show: boolean) => void;
}

export function AtabeyDashboard({ onNavigate, showApprovalModal, onToggleApprovalModal }: AtabeyDashboardProps) {
    const { t } = useI18n();
    const { data: serverApprovals } = useApi<ApprovalItem[]>("/approvals", 4000);
    const [localApprovalOpen, setLocalApprovalOpen] = useState(false);

    const pendingList = Array.isArray(serverApprovals)
        ? serverApprovals.filter(a => a.status.toUpperCase() === "PENDING")
        : [];
    const pendingCount = pendingList.length;

    const isApprovalOpen = showApprovalModal !== undefined ? showApprovalModal : localApprovalOpen;
    const setApprovalOpen = (val: boolean) => {
        if (onToggleApprovalModal) {
            onToggleApprovalModal(val);
        } else {
            setLocalApprovalOpen(val);
        }
    };

    return (
        <div className="atabey-dashboard-root">
            {/* Main 2x2 Responsive Content Grid */}
            <div className="atabey-dashboard-grid">
                {/* 1. Top Left: FinOps Budget Manager */}
                <FinOpsBudgetCard onNavigate={() => onNavigate("finops")} />

                {/* 2. Top Right: Active Specialist Agents Status Grid */}
                <SpecialistAgentsGridCard onNavigate={() => onNavigate("agents")} />

                {/* 3. Bottom Left: Daily LLM Token Costs */}
                <TokenCostsChartCard />

                {/* 4. Bottom Right: PII Masking & Compliance */}
                <PIIComplianceCard onNavigate={() => onNavigate("privacy")} />
            </div>

            {/* Floating Re-Open Trigger if Modal is Closed & Pending requests exist */}
            {!isApprovalOpen && pendingCount > 0 && (
                <button
                    className="floating-hitl-trigger animate-bounce"
                    onClick={() => setApprovalOpen(true)}
                    title={t("hitl.title")}
                >
                    <span className="hitl-pulse-dot" />
                    <ShieldAlert size={18} />
                    <span>{t("hitl.title")} ({t("hitl.pending_badge", { count: pendingCount })})</span>
                </button>
            )}

            {/* Approval Center (Human-in-the-Loop) Modal Dialog */}
            <ApprovalCenterModal
                isOpen={isApprovalOpen}
                onClose={() => setApprovalOpen(false)}
            />
        </div>
    );
}
