import { CheckCircle, MoreHorizontal, ShieldCheck } from "lucide-react";
import React, { useRef, useState } from "react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

interface AuditEntry {
    id?: number;
    timestamp: string;
    action: string;
    status: string;
    agent?: string;
    category?: string;
    detail?: string;
}

interface AuditResponse {
    data: {
        stats: {
            totalRecords: number;
            byStatus?: Record<string, number>;
        };
        entries: AuditEntry[];
    };
}

export function PIIComplianceCard({ onNavigate }: { onNavigate?: () => void }) {
    const { t } = useI18n();
    const { data: auditData } = useApi<AuditResponse>("/audit", 5000);
    const logScrollRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const stats = auditData?.data?.stats;
    const entries = auditData?.data?.entries || [];

    const liveLogs = entries.slice(-15).reverse().map((e, idx) => ({
        id: `audit-${e.id || idx}`,
        timestamp: e.timestamp ? e.timestamp.replace("T", " ").substring(0, 19) : new Date().toISOString().replace("T", " ").substring(0, 19),
        message: `${e.action} [${e.status}] - ${e.agent || "system"}`,
    }));

    return (
        <div className="atabey-card pii-compliance-card">
            <div className="atabey-card-header">
                <div className="card-title-group">
                    <h3 className="card-title">{t("card.privacy.title")}</h3>
                    <span className="card-subtitle">KVKK / GDPR / ISO-27001</span>
                </div>
                <div className="card-actions">
                    <div className="live-telemetry-badge">
                        <span className="telemetry-live-dot" />
                        <span>Live Audit</span>
                    </div>
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
                                {t("card.privacy.view_audit")}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Stat Cards (Real Audit Stats) */}
            <div className="pii-stats-row">
                <div className="pii-mini-card">
                    <div className="pii-mini-icon-box status-success-icon">
                        <CheckCircle size={20} />
                    </div>
                    <div className="pii-mini-content">
                        <h4 className="pii-mini-title">KVKK / GDPR Compliance</h4>
                        <p className="pii-mini-desc">Active Masking & Consent Gates</p>
                    </div>
                </div>

                <div className="pii-mini-card">
                    <div className="pii-mini-icon-box status-indigo-icon">
                        <ShieldCheck size={20} />
                    </div>
                    <div className="pii-mini-content">
                        <h4 className="pii-mini-title">{t("card.privacy.tamper_evident")}</h4>
                        <p className="pii-mini-desc">
                            <span className="metric-highlight">{stats?.totalRecords ?? entries.length}</span> verified audit blocks
                        </p>
                    </div>
                </div>
            </div>

            {/* Live Terminal Log Stream Container */}
            <div className="pii-log-stream-container" ref={logScrollRef}>
                {liveLogs.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">
                        {t("card.privacy.no_logs")}
                    </div>
                ) : (
                    <div className="pii-log-stream-inner">
                        {liveLogs.map(log => (
                            <div key={log.id} className="log-line">
                                <span className="log-timestamp">{log.timestamp}</span>
                                <span className="log-separator"></span>
                                <span className="log-text">{log.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
