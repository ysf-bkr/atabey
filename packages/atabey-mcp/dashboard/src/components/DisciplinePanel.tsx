import { Activity, AlertTriangle, Ban, Cpu, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface AgentDisciplineStats {
    totalCalls: number;
    recentCalls: number;
    inCooldown: boolean;
    cooldownRemaining: number;
    violations: number;
    lastViolation: string | null;
}

export function DisciplinePanel() {
    const [data, setData] = useState<Record<string, AgentDisciplineStats> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"violations" | "calls">("violations");

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/discipline");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                throw new Error(json.error || "Failed to fetch discipline stats");
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
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return <div className="card"><div className="empty-state">Loading Discipline Stats...</div></div>;
    }

    if (error && !data) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><AlertTriangle size={20} style={{ color: "var(--color-error)" }} /> Discipline Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const entries = Object.entries(data || {}).sort((a, b) =>
        sortBy === "violations" ? b[1].violations - a[1].violations : b[1].totalCalls - a[1].totalCalls
    );

    const totalViolations = entries.reduce((sum, [, v]) => sum + v.violations, 0);
    const totalCalls = entries.reduce((sum, [, v]) => sum + v.totalCalls, 0);
    const inCooldown = entries.some(([, v]) => v.inCooldown);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #2a0a0a 100%)", border: "1px solid #312e81" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #312e81" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ShieldCheck size={28} style={{ color: "var(--color-accent-primary)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>AI Discipline Engine</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>
                                Real-time AI behavior monitoring & enforcement
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchData} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Activity size={16} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">Total Calls</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{totalCalls}</div>
                        <div className="stat-card-desc">All agent tool calls</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><AlertTriangle size={16} style={{ color: totalViolations > 0 ? "var(--color-error)" : "var(--color-success)" }} /><span className="stat-title">Violations</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: totalViolations > 0 ? "var(--color-error)" : "var(--color-success)" }}>{totalViolations}</div>
                        <div className="stat-card-desc">{totalViolations > 0 ? "Rules broken" : "All clear"}</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Ban size={16} style={{ color: inCooldown ? "var(--color-warning)" : "var(--color-success)" }} /><span className="stat-title">Cooldown</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: inCooldown ? "var(--color-warning)" : "var(--color-success)" }}>{inCooldown ? "Active" : "None"}</div>
                        <div className="stat-card-desc">{inCooldown ? "Agent(s) rate limited" : "All agents active"}</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Cpu size={16} style={{ color: "var(--color-accent-muted)" }} /><span className="stat-title">Agents</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-accent-muted)" }}>{entries.length}</div>
                        <div className="stat-card-desc">Tracked agents</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Agent Discipline Status</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className={`filter-tab ${sortBy === "violations" ? "active" : ""}`} onClick={() => setSortBy("violations")} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>By Violations</button>
                        <button className={`filter-tab ${sortBy === "calls" ? "active" : ""}`} onClick={() => setSortBy("calls")} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>By Calls</button>
                    </div>
                </div>
                <div className="list-container">
                    {entries.length === 0 && <div className="empty-state">No agent activity recorded yet</div>}
                    {entries.map(([agent, stats]) => {
                        const violationRate = stats.totalCalls > 0 ? ((stats.violations / stats.totalCalls) * 100).toFixed(1) : "0.0";
                        return (
                            <div key={agent} className="list-item" style={{ borderLeft: stats.inCooldown ? "3px solid var(--color-warning)" : stats.violations > 0 ? "3px solid var(--color-error)" : "3px solid var(--color-success)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ color: "var(--color-accent-primary)", fontWeight: 600 }}>@{agent}</span>
                                        {stats.inCooldown && <span className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "var(--color-warning)" }}>Cooldown {Math.ceil(stats.cooldownRemaining / 1000)}s</span>}
                                        {stats.violations > 0 && <span className="badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)" }}>{stats.violations} violations</span>}
                                        {stats.violations === 0 && <span className="badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-success)" }}>Clean</span>}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--color-dim)" }}>
                                        <span>{stats.totalCalls} total</span>
                                        <span>{stats.recentCalls}/min</span>
                                        <span>{violationRate}% violation rate</span>
                                    </div>
                                </div>
                                {stats.lastViolation && (
                                    <div style={{ fontSize: "0.75rem", color: "var(--color-error)", background: "rgba(239, 68, 68, 0.05)", padding: "6px 8px", borderRadius: 4, marginTop: 4 }}>
                                        <strong>Last violation:</strong> {stats.lastViolation}
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
