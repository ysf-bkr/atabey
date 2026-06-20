import { Clock, Eye, EyeOff, FileWarning, Filter, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

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

const PII_CATEGORY_COLORS: Record<string, string> = {
    USER_DATA: "var(--color-accent-primary)",
    SECURITY: "var(--color-accent-primary)",
    COMPLIANCE: "var(--color-success)",
    OPERATIONAL: "var(--color-accent-primary)",
    CONFIDENTIAL: "var(--color-warning)",
    RESTRICTED: "var(--color-accent-primary)",
};

export function PrivacyPanel() {
    const [data, setData] = useState<{ stats: AuditStats; entries: AuditEntry[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirmationCode, setConfirmationCode] = useState("");
    const [erasing, setErasing] = useState(false);
    const [erasureMessage, setErasureMessage] = useState<string | null>(null);
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

    useEffect(() => { fetchData(); }, []);

    const handleErasure = async (e: React.FormEvent) => {
        e.preventDefault();
        if (confirmationCode !== "KVKK-RIGHT-TO-ERASURE") {
            alert("Please enter the correct confirmation code: KVKK-RIGHT-TO-ERASURE");
            return;
        }
        if (!confirm("Are you sure you want to execute Right to Erasure? This will permanently delete all logs containing personal data.")) return;
        setErasing(true);
        setErasureMessage(null);
        try {
            const res = await fetch("/api/audit/erase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmationCode }),
            });
            const json = await res.json();
            if (json.success) {
                setErasureMessage(json.message);
                setConfirmationCode("");
                fetchData();
            } else throw new Error(json.error || "Erasure failed");
        } catch (err) { alert("Erasure failed: " + (err as Error).message); }
        finally { setErasing(false); }
    };

    if (loading && !data) return <div className="card"><div className="empty-state">Loading GDPR/KVKK Privacy Logs...</div></div>;
    if (error && !data) return (
        <div className="card">
            <div className="card-header"><h2><ShieldAlert size={20} style={{ color: "var(--color-error)" }} /> Privacy Governance Error</h2></div>
            <div className="error" style={{ padding: 16 }}>{error}</div>
        </div>
    );

    const stats = data?.stats;
    const entries = data?.entries || [];
    const piiMaskedCount = stats?.byAction?.["MASK_PII"] || stats?.byAction?.["PII_MASKED"] || 0;
    const piiDetectedCount = stats?.byAction?.["PII_DETECTED"] || 0;
    const filteredEntries = categoryFilter === "ALL" ? entries : entries.filter(e => e.dataCategory === categoryFilter);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)", border: "1px solid #312e81" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #312e81" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ShieldCheck size={28} style={{ color: "var(--color-accent-primary)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>GDPR & KVKK Compliance Auditor</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>Automated PII Masking, Data Retention TTL & Erasure Log</p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchData} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>
                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><ShieldAlert size={16} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">Total Audit Entries</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{stats?.total || 0}</div>
                        <div className="stat-card-desc">Evaluated compliance records</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><EyeOff size={16} style={{ color: "var(--color-success)" }} /><span className="stat-title">PII Masked</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-success)" }}>{piiMaskedCount}</div>
                        <div className="stat-card-desc">Sensitive records scrubbed</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Eye size={16} style={{ color: "var(--color-warning)" }} /><span className="stat-title">PII Detected</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-warning)" }}>{piiDetectedCount}</div>
                        <div className="stat-card-desc">Potential PII flagged</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Clock size={16} style={{ color: "var(--color-warning)" }} /><span className="stat-title">Data Retention TTL</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-warning)" }}>30 Days</div>
                        <div className="stat-card-desc">Auto-deleted after expiry</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Trash2 size={16} style={{ color: "var(--color-error)" }} /><span className="stat-title">Expired Cleaned</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-error)" }}>{stats?.expiredCount || 0}</div>
                        <div className="stat-card-desc">Records removed by TTL</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><FileWarning size={16} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">Restricted Data</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-accent-primary)" }}>{stats?.byCategory?.["RESTRICTED"] || 0}</div>
                        <div className="stat-card-desc">Highest sensitivity level</div>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div className="card">
                    <div className="card-header"><h2><Trash2 size={18} style={{ color: "var(--color-error)" }} /> GDPR Art. 17 & KVKK Art. 7 Data Subject Erasure</h2></div>
                    <div style={{ padding: 12 }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--color-text-soft)", marginBottom: 12 }}>
                            Simulate the <strong>Right to Erasure (Unutulma Hakkı)</strong>. If a user requests erasure of their personal data, entering the validation code below will wipe their personal data entries from Atabey.
                        </p>
                        <form onSubmit={handleErasure} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <input type="text" placeholder="Enter confirmation: KVKK-RIGHT-TO-ERASURE" value={confirmationCode}
                                onChange={(e) => setConfirmationCode(e.target.value)}
                                style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "0.85rem" }} />
                            <button type="submit" disabled={erasing || confirmationCode !== "KVKK-RIGHT-TO-ERASURE"}
                                style={{ padding: "8px 12px", borderRadius: 4, background: confirmationCode === "KVKK-RIGHT-TO-ERASURE" ? "var(--color-accent-primary)" : "#1f2937", color: "#fff", border: "none", cursor: confirmationCode === "KVKK-RIGHT-TO-ERASURE" ? "pointer" : "not-allowed", fontWeight: 600, fontSize: "0.85rem" }}>
                                {erasing ? "Processing Erasure..." : "Execute Right to Erasure"}
                            </button>
                        </form>
                        {erasureMessage && <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid var(--color-success)", borderRadius: 4, color: "var(--color-success)", fontSize: "0.8rem" }}>{erasureMessage}</div>}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h2>Data Classification Breakdown</h2>
                        <span className="badge"><Filter size={12} style={{ marginRight: 4 }} />{Object.keys(stats?.byCategory || {}).length} categories</span>
                    </div>
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        {Object.entries(stats?.byCategory || {}).map(([category, count]) => {
                            const percent = stats?.total ? Math.round((count / stats.total) * 100) : 0;
                            const color = PII_CATEGORY_COLORS[category] || "var(--color-accent-primary)";
                            let levelLabel = "Standard";
                            if (category === "USER_DATA" || category === "CONFIDENTIAL") levelLabel = "Confidential";
                            if (category === "SECURITY" || category === "RESTRICTED") levelLabel = "Restricted";
                            return (
                                <div key={category}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 4 }}>
                                        <span style={{ fontWeight: 500 }}>{category}
                                            <span style={{ marginLeft: 6, fontSize: "0.65rem", padding: "1px 4px", borderRadius: 2, background: levelLabel === "Restricted" ? "rgba(239, 68, 68, 0.15)" : "rgba(234, 179, 8, 0.15)", color: levelLabel === "Restricted" ? "var(--color-error)" : "var(--color-warning)" }}>{levelLabel}</span>
                                        </span>
                                        <span style={{ color: "var(--color-text-soft)" }}>{count} ({percent}%)</span>
                                    </div>
                                    <div style={{ height: 8, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: `${percent}%`, background: color, borderRadius: 4, transition: "width 0.3s ease" }} />
                                    </div>
                                </div>
                            );
                        })}
                        {Object.keys(stats?.byCategory || {}).length === 0 && <div className="empty-state">No classified categories recorded yet</div>}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>PII Compliance Audit Trail</h2>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                            style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "0.75rem" }}>
                            <option value="ALL">All Categories</option>
                            <option value="USER_DATA">User Data</option>
                            <option value="SECURITY">Security</option>
                            <option value="COMPLIANCE">Compliance</option>
                            <option value="OPERATIONAL">Operational</option>
                            <option value="RESTRICTED">Restricted</option>
                            <option value="CONFIDENTIAL">Confidential</option>
                        </select>
                        <span className="badge">{filteredEntries.length} events</span>
                    </div>
                </div>
                <div className="list-container">
                    {filteredEntries.length === 0 && <div className="empty-state">No compliance events logged yet</div>}
                    {filteredEntries.map((entry, idx) => {
                        const isExpanded = expandedEntry === idx;
                        const isUserData = entry.dataCategory === "USER_DATA";
                        const isRestricted = entry.dataCategory === "RESTRICTED";
                        let borderLeft = "3px solid var(--color-dim)";
                        if (isUserData) borderLeft = "3px solid var(--color-accent-primary)";
                        if (isRestricted) borderLeft = "3px solid var(--color-error)";
                        return (
                            <div key={entry.id || idx} className="list-item" style={{ borderLeft, cursor: "pointer", background: isExpanded ? "rgba(255, 255, 255, 0.02)" : undefined }}
                                onClick={() => setExpandedEntry(isExpanded ? null : idx)}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem" }}>
                                        <span style={{ color: "var(--color-dim)" }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                        <span style={{ color: "var(--color-accent-primary)", fontWeight: 500 }}>{entry.agent}</span>
                                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.65rem", background: isUserData ? "var(--color-accent-glow)" : "rgba(59, 130, 246, 0.1)", color: isUserData ? "var(--color-accent-primary)" : "var(--color-accent-primary)" }}>{entry.dataCategory || "OPERATIONAL"}</span>
                                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.65rem", background: entry.status === "SUCCESS" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", color: entry.status === "SUCCESS" ? "var(--color-success)" : "var(--color-error)" }}>{entry.status}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {entry.action.toLowerCase().includes("pii") || entry.action.toLowerCase().includes("mask") ? (
                                            <span style={{ fontSize: "0.65rem", padding: "1px 6px", borderRadius: 3, background: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)", display: "flex", alignItems: "center", gap: 3 }}><EyeOff size={10} /> Masked</span>
                                        ) : null}
                                        <span style={{ fontSize: "0.7rem", color: "var(--color-dim)" }}>TTL: {entry.retentionDays || 30}d</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: "0.85rem", color: "var(--color-text-soft)" }}>
                                    <strong style={{ color: "var(--color-text-primary)" }}>{entry.action}</strong>
                                    {entry.details && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "var(--color-success)", background: "rgba(16, 185, 129, 0.1)", padding: "1px 6px", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 3 }}><EyeOff size={10} /> PII Auto-Redacted</span>}
                                </div>
                                {isExpanded && entry.details && (
                                    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: 10, background: "var(--color-code-bg)", border: "1px solid var(--color-code-border)", borderRadius: 4, fontSize: "0.8rem", fontFamily: "monospace", color: "var(--color-success)", overflowX: "auto" }}>
                                        <div style={{ color: "var(--color-text-soft)", borderBottom: "1px solid var(--color-code-border)", paddingBottom: 4, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                                            <span>[KVKK / GDPR Compliance Details]</span>
                                            <span style={{ color: "var(--color-accent-primary)" }}>PII auto-redacted</span>
                                        </div>
                                        <pre style={{ margin: 0 }}>{JSON.stringify(entry.details, null, 2)}</pre>
                                    </div>
                                )}
                                {isExpanded && entry.traceId && <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--color-dim)", fontFamily: "monospace" }}>Trace: {entry.traceId}</div>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
