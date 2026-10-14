import { MoreHorizontal } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

interface FinOpsData {
    team?: string;
    monthlySpend?: number;
    monthlyBudget?: number;
    budgetLimit?: number;
    blocked?: boolean;
}

export function FinOpsBudgetCard({ onNavigate }: { onNavigate?: () => void }) {
    const { t } = useI18n();
    const { data: finopsData, refetch } = useApi<{ success: boolean; data: FinOpsData }>("/finops", 5000);
    const [menuOpen, setMenuOpen] = useState(false);
    const [resetting, setResetting] = useState(false);

    // Live values from SQLite (zero mock data)
    const monthlySpend = finopsData?.data?.monthlySpend ?? 0;
    const monthlyBudget = finopsData?.data?.monthlyBudget ?? finopsData?.data?.budgetLimit ?? 100.0;
    const percentage = monthlyBudget > 0 ? Math.min((monthlySpend / monthlyBudget) * 100, 100) : 0;

    // SVG Circular calculations
    const size = 260;
    const strokeWidth = 16;
    const center = size / 2;
    const radius = center - strokeWidth - 10;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = percentage > 0
        ? circumference - (circumference * (percentage / 100))
        : circumference;

    const handleReset = async () => {
        setMenuOpen(false);
        setResetting(true);
        try {
            await fetch("/api/finops/reset", { method: "POST" });
            refetch();
        } catch { /* ignore */ }
        finally {
            setResetting(false);
        }
    };

    return (
        <div className="atabey-card finops-budget-card">
            <div className="atabey-card-header">
                <div className="card-title-group">
                    <h3 className="card-title">{t("card.finops.title")}</h3>
                </div>
                <div className="card-actions">
                    <button
                        className="icon-action-btn"
                        title={t("common.actions")}
                        onClick={() => setMenuOpen(!menuOpen)}
                    >
                        <MoreHorizontal size={18} />
                    </button>
                    {menuOpen && (
                        <div className="card-dropdown-menu animate-fade-in">
                            <button onClick={() => { setMenuOpen(false); onNavigate?.(); }}>
                                {t("card.finops.detailed")}
                            </button>
                            <button onClick={handleReset} disabled={resetting}>
                                {resetting ? t("hitl.submitting") : t("card.finops.reset_period")}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="finops-gauge-container">
                <div className="gauge-wrapper">
                    <svg
                        className="gauge-svg"
                        viewBox={`0 0 ${size} ${size}`}
                        width="100%"
                        height="100%"
                    >
                        <defs>
                            <linearGradient id="finopsProgressGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#d946ef" />
                                <stop offset="45%" stopColor="#a855f7" />
                                <stop offset="80%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#38bdf8" />
                            </linearGradient>
                            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="6" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Outer Track */}
                        <circle
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="#14172a"
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                        />

                        {/* Progress Ring with Live Gradient */}
                        {percentage > 0 && (
                            <circle
                                cx={center}
                                cy={center}
                                r={radius}
                                fill="none"
                                stroke="url(#finopsProgressGrad)"
                                strokeWidth={strokeWidth}
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${center} ${center})`}
                                filter="url(#gaugeGlow)"
                                className="gauge-progress-circle"
                            />
                        )}
                    </svg>

                    {/* Centered Values inside Gauge */}
                    <div className="gauge-center-content">
                        <span className="gauge-label">{t("card.finops.monthly_spend")}</span>
                        <h2 className="gauge-value">${monthlySpend.toFixed(2)}</h2>
                        <span className="gauge-subtext">/ ${monthlyBudget.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
