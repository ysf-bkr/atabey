import { Activity, AlertTriangle, Ban, DollarSign, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface BudgetState {
    team: string;
    monthlySpend: number;
    agentSpend: Record<string, number>;
    periodStart: string;
    periodEnd: string;
    blocked: boolean;
    blockReason: string | null;
    triggeredAlerts: number[];
    lastSync: string | null;
}

interface AgentBudgetResult {
    allowed: boolean;
    monthlySpend: number;
    monthlyBudget: number;
    agentSpend: number;
    agentMaxBudget: number;
    usagePercent: number;
    blocked: boolean;
    blockReason: string | null;
}

export function FinOpsPanel() {
    const [state, setState] = useState<BudgetState | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<string>("default");
    const [agentCheck, setAgentCheck] = useState<AgentBudgetResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resetting, setResetting] = useState(false);

    const fetchState = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/finops");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setState(json.data);
            } else {
                throw new Error(json.error || "Failed to fetch budget state");
            }
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const checkAgent = async (agent: string) => {
        try {
            const res = await fetch(`/api/finops/check?agent=${encodeURIComponent(agent)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setAgentCheck(json.data);
            }
        } catch {
            setAgentCheck(null);
        }
    };

    const resetBudget = async () => {
        if (!confirm("Are you sure you want to reset the budget period?")) return;
        setResetting(true);
        try {
            const res = await fetch("/api/finops/reset", { method: "POST" });
            if (res.ok) {
                await fetchState();
            }
        } finally {
            setResetting(false);
        }
    };

    useEffect(() => {
        fetchState();
        const interval = setInterval(fetchState, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedAgent) checkAgent(selectedAgent);
    }, [selectedAgent, state]);

    if (loading && !state) {
        return <div className="card"><div className="empty-state">Loading FinOps Budget...</div></div>;
    }

    if (error && !state) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><AlertTriangle size={20} style={{ color: "var(--color-error)" }} /> FinOps Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const agents = state ? Object.keys(state.agentSpend) : [];
    const monthlyBudget = 100; // Default display
    const usagePercent = monthlyBudget > 0 && state ? ((state.monthlySpend / monthlyBudget) * 100) : 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #0a2a1a 100%)", border: "1px solid #065f46" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #065f46" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <DollarSign size={28} style={{ color: "var(--color-success)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>FinOps Budget Manager</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>
                                Team: <strong>{state?.team || "N/A"}</strong>
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="sidebar-btn" onClick={resetBudget} disabled={resetting} style={{ width: "auto", padding: "6px 12px" }}>
                            {resetting ? "Resetting..." : "Reset Period"}
                        </button>
                        <button className="sidebar-btn" onClick={fetchState} style={{ width: "auto", padding: "6px 12px" }}>
                            <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                        </button>
                    </div>
                </div>

                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><DollarSign size={16} style={{ color: "var(--color-success)" }} /><span className="stat-title">Monthly Spend</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: state?.blocked ? "var(--color-error)" : "var(--color-success)" }}>
                            ${state?.monthlySpend.toFixed(2) || "0.00"}
                        </div>
                        <div className="stat-card-desc">Current period spend</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Activity size={16} style={{ color: usagePercent > 80 ? "var(--color-warning)" : "var(--color-accent-primary)" }} /><span className="stat-title">Usage</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{usagePercent.toFixed(1)}%</div>
                        <div className="stat-card-desc">Of monthly budget used</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Users size={16} style={{ color: "var(--color-accent-muted)" }} /><span className="stat-title">Agents</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "var(--color-accent-muted)" }}>{agents.length}</div>
                        <div className="stat-card-desc">Active spenders</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Ban size={16} style={{ color: state?.blocked ? "var(--color-error)" : "var(--color-success)" }} /><span className="stat-title">Status</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: state?.blocked ? "var(--color-error)" : "var(--color-success)" }}>{state?.blocked ? "BLOCKED" : "Active"}</div>
                        <div className="stat-card-desc">{state?.blocked ? "Budget exceeded" : "Within budget"}</div>
                    </div>
                </div>

                {state?.blocked && (
                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 6, color: "var(--color-error)", fontSize: "0.85rem" }}>
                        <strong>⛔ Budget Blocked:</strong> {state.blockReason}
                    </div>
                )}

                {state?.triggeredAlerts && state.triggeredAlerts.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {state.triggeredAlerts.map(t => (
                            <span key={t} className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "var(--color-warning)" }}>
                                ⚠️ {t}% threshold triggered
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Agent Spend Breakdown</h2>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            style={{ padding: "4px 8px", background: "#111827", color: "white", border: "1px solid #374151", borderRadius: 4, fontSize: "0.8rem" }}
                        >
                            {agents.length === 0 && <option value="default">No agents yet</option>}
                            {agents.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
                <div className="list-container">
                    {agents.length === 0 && <div className="empty-state">No agent spending recorded yet</div>}
                    {agents.map((agent) => {
                        const spend = state?.agentSpend[agent] || 0;
                        const agentMax = agentCheck?.agentMaxBudget || 50;
                        const agentPercent = agentMax > 0 ? (spend / agentMax) * 100 : 0;
                        const overLimit = agentPercent >= 100;

                        return (
                            <div key={agent} className="list-item" style={{ borderLeft: overLimit ? "3px solid var(--color-error)" : agentPercent > 80 ? "3px solid var(--color-warning)" : "3px solid var(--color-success)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ color: "var(--color-accent-primary)", fontWeight: 600 }}>@{agent}</span>
                                        {overLimit && <span className="badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)" }}>Over Limit</span>}
                                        {agentPercent > 80 && !overLimit && <span className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "var(--color-warning)" }}>Warning</span>}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.75rem", color: "var(--color-dim)" }}>
                                        <span>${spend.toFixed(3)}</span>
                                        <span>{agentPercent.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div style={{ width: "100%", height: 4, background: "#1f2937", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                                    <div style={{
                                        width: `${Math.min(agentPercent, 100)}%`,
                                        height: "100%",
                                        background: overLimit ? "var(--color-error)" : agentPercent > 80 ? "var(--color-warning)" : "var(--color-success)",
                                        borderRadius: 2,
                                        transition: "width 0.3s ease"
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {state && (
                <div className="card">
                    <div className="card-header"><h2>Budget Period</h2></div>
                    <div style={{ padding: 12, fontSize: "0.8rem", color: "var(--color-dim)", display: "flex", gap: 24, flexWrap: "wrap" }}>
                        <span>📅 Start: {new Date(state.periodStart).toLocaleDateString()}</span>
                        <span>📅 End: {new Date(state.periodEnd).toLocaleDateString()}</span>
                        {state.lastSync && <span>🔄 Last Sync: {new Date(state.lastSync).toLocaleTimeString()}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
