import { Activity, AlertTriangle, Ban, RefreshCw, Shield, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface LoopAlert {
    type: "consecutive_same_tool" | "file_churn" | "oscillation" | "rate_limit" | "content_identity";
    severity: "warning" | "critical";
    agent: string;
    detail: string;
    timestamp: number;
    cooldownUntil: number | null;
}

interface AgentLoopStats {
    totalCalls: number;
    recentCalls: number;
    inCooldown: boolean;
    cooldownCount: number;
    consecutiveTools: Record<string, number>;
    fileWrites: Record<string, number>;
    fileReads: Record<string, number>;
    lastAlert: LoopAlert | null;
}

export function LoopDetectorPanel() {
    const [data, setData] = useState<Record<string, AgentLoopStats> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [clearing, setClearing] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/loop-detector");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                throw new Error(json.error || "Failed to fetch loop stats");
            }
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const clearCooldown = async (agent: string) => {
        setClearing(agent);
        try {
            const res = await fetch(`/api/loop-detector/clear/${encodeURIComponent(agent)}`, { method: "POST" });
            if (res.ok) {
                await fetchData();
            }
        } finally {
            setClearing(null);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return <div className="card"><div className="empty-state">Loading Loop Detector...</div></div>;
    }

    if (error && !data) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><AlertTriangle size={20} style={{ color: "var(--color-error)" }} /> Loop Detector Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const entries = Object.entries(data || {});
    const totalCooldowns = entries.reduce((sum, [, v]) => sum + v.cooldownCount, 0);
    const inCooldown = entries.filter(([, v]) => v.inCooldown).length;
    const totalAlerts = entries.filter(([, v]) => v.lastAlert !== null).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #2a0a1a 100%)", border: "1px solid #7f1d1d" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #7f1d1d" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Shield size={28} style={{ color: "var(--color-warning)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>Loop Detector</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>
                                Multi-pattern infinite loop prevention
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchData} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Activity size={16} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">Agents</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{entries.length}</div>
                        <div className="stat-card-desc">Monitored agents</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><AlertTriangle size={16} style={{ color: totalAlerts > 0 ? "var(--color-warning)" : "var(--color-success)" }} /><span className="stat-title">Alerts</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: totalAlerts > 0 ? "var(--color-warning)" : "var(--color-success)" }}>{totalAlerts}</div>
                        <div className="stat-card-desc">Active loop alerts</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Ban size={16} style={{ color: inCooldown > 0 ? "var(--color-error)" : "var(--color-success)" }} /><span className="stat-title">Cooldown</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: inCooldown > 0 ? "var(--color-error)" : "var(--color-success)" }}>{inCooldown}</div>
                        <div className="stat-card-desc">Agents in cooldown</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><XCircle size={16} style={{ color: "var(--color-accent-muted)" }} /><span className="stat-title">Total Cooldowns</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-accent-muted)" }}>{totalCooldowns}</div>
                        <div className="stat-card-desc">Since server start</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Agent Loop Status</h2>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-dim)" }}>
                        {inCooldown > 0 ? `${inCooldown} agent(s) in cooldown` : "All agents normal"}
                    </div>
                </div>
                <div className="list-container">
                    {entries.length === 0 && <div className="empty-state">No agent activity recorded yet</div>}
                    {entries.map(([agent, stats]) => {
                        const alertType = stats.lastAlert?.type || null;
                        const alertSeverity = stats.lastAlert?.severity || null;
                        const borderColor = stats.inCooldown ? "var(--color-error)" : alertSeverity === "warning" ? "var(--color-warning)" : "var(--color-success)";

                        return (
                            <div key={agent} className="list-item" style={{ borderLeft: `3px solid ${borderColor}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ color: "var(--color-accent-primary)", fontWeight: 600 }}>@{agent}</span>
                                        {stats.inCooldown && <span className="badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)" }}>Cooldown</span>}
                                        {alertType && !stats.inCooldown && (
                                            <span className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "var(--color-warning)" }}>
                                                {alertType.replace(/_/g, " ")}
                                            </span>
                                        )}
                                        {!alertType && !stats.inCooldown && (
                                            <span className="badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-success)" }}>Normal</span>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ fontSize: "0.75rem", color: "var(--color-dim)", display: "flex", gap: 8 }}>
                                            <span>{stats.totalCalls} calls</span>
                                            <span>{stats.cooldownCount} cooldowns</span>
                                        </div>
                                        {stats.inCooldown && (
                                            <button
                                                className="sidebar-btn"
                                                onClick={() => clearCooldown(agent)}
                                                disabled={clearing === agent}
                                                style={{ width: "auto", padding: "2px 8px", fontSize: "0.7rem" }}
                                            >
                                                {clearing === agent ? "..." : "Clear"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {stats.lastAlert && (
                                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-soft)", background: "rgba(239, 68, 68, 0.05)", padding: "6px 8px", borderRadius: 4, marginTop: 4 }}>
                                        <strong>Last alert:</strong> {stats.lastAlert.detail}
                                    </div>
                                )}

                                {(Object.keys(stats.consecutiveTools).length > 0 || Object.keys(stats.fileWrites).length > 0) && (
                                    <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: "0.7rem", color: "var(--color-dim)", flexWrap: "wrap" }}>
                                        {Object.entries(stats.consecutiveTools).filter(([, c]) => c > 0).map(([tool, count]) => (
                                            <span key={tool} style={{ background: "rgba(59, 130, 246, 0.1)", padding: "2px 6px", borderRadius: 3 }}>
                                                🔄 {tool}: {count}x
                                            </span>
                                        ))}
                                        {Object.entries(stats.fileWrites).map(([file, count]) => (
                                            <span key={file} style={{ background: "rgba(234, 179, 8, 0.1)", padding: "2px 6px", borderRadius: 3 }}>
                                                📝 {file.split("/").pop()}: {count}x
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
