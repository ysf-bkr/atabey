import { Activity, AlertTriangle, BarChart3, Cpu, DollarSign, RefreshCw, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface MetricEntry {
    timestamp: string;
    agent: string;
    action: string;
    estimatedTokens: number;
    error?: string;
}

interface MetricsResponse {
    success: boolean;
    data: {
        totalToolCalls: number;
        totalEstimatedTokens: number;
        totalEstimatedCost: number;
        byAgent: Record<string, { calls: number; tokens: number; cost: number }>;
        byAction: Record<string, { calls: number; tokens: number }>;
        recentEntries: MetricEntry[];
    };
}

const COST_PER_1K_TOKENS = 0.003; // ~$0.003 per 1K tokens (Claude Sonnet pricing)

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
}

function formatCost(cents: number): string {
    if (cents < 1) return "< $0.01";
    return `$${(cents).toFixed(2)}`;
}

export function TokenEconomyPanel() {
    const [data, setData] = useState<MetricsResponse["data"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"tokens" | "calls">("tokens");

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/metrics");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                throw new Error(json.error || "Failed to fetch metrics");
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
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return <div className="card"><div className="empty-state">Loading Token Economy Metrics...</div></div>;
    }

    if (error && !data) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><AlertTriangle size={20} style={{ color: "#ef4444" }} /> Token Economy Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const metrics = data!;
    const agentList = Object.entries(metrics.byAgent).sort((a, b) =>
        sortBy === "tokens" ? b[1].tokens - a[1].tokens : b[1].calls - a[1].calls
    );

    const maxTokens = Math.max(...agentList.map(([, v]) => v.tokens), 1);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header */}
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", border: "1px solid #312e81" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #312e81" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Cpu size={28} style={{ color: "#38bdf8" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#f8fafc" }}>Token Economy & Cost Tracking</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                                Estimated token usage based on tool call payload sizes (~1 token = 4 chars)
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchData} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                {/* Top Stats */}
                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <Activity size={16} style={{ color: "#38bdf8" }} />
                            <span className="stat-title">Total Tool Calls</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{formatNumber(metrics.totalToolCalls)}</div>
                        <div className="stat-card-desc">MCP tool invocations</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <BarChart3 size={16} style={{ color: "#eab308" }} />
                            <span className="stat-title">Est. Tokens</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "#eab308" }}>{formatNumber(metrics.totalEstimatedTokens)}</div>
                        <div className="stat-card-desc">~{metrics.totalEstimatedTokens > 0 ? (metrics.totalEstimatedTokens / metrics.totalToolCalls).toFixed(0) : 0} tokens/call avg</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <DollarSign size={16} style={{ color: "#22c55e" }} />
                            <span className="stat-title">Est. Cost</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "#22c55e" }}>{formatCost(metrics.totalEstimatedCost)}</div>
                        <div className="stat-card-desc">At ~${COST_PER_1K_TOKENS}/1K tokens</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <TrendingUp size={16} style={{ color: "#a78bfa" }} />
                            <span className="stat-title">Cost Efficiency</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: "#a78bfa" }}>
                            {metrics.totalEstimatedCost > 0
                                ? (metrics.totalToolCalls / metrics.totalEstimatedCost).toFixed(1)
                                : "N/A"}
                        </div>
                        <div className="stat-card-desc">Calls per cent</div>
                    </div>
                </div>
            </div>

            {/* Agent Breakdown & Action Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                {/* Agent Token Usage */}
                <div className="card">
                    <div className="card-header">
                        <h2>Token Usage by Agent</h2>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                className={`filter-tab ${sortBy === "tokens" ? "active" : ""}`}
                                onClick={() => setSortBy("tokens")}
                                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                            >
                                By Tokens
                            </button>
                            <button
                                className={`filter-tab ${sortBy === "calls" ? "active" : ""}`}
                                onClick={() => setSortBy("calls")}
                                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                            >
                                By Calls
                            </button>
                        </div>
                    </div>
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {agentList.length === 0 && <div className="empty-state">No agent activity recorded yet</div>}
                        {agentList.map(([agent, stats]) => {
                            const barWidth = (stats.tokens / maxTokens) * 100;
                            return (
                                <div key={agent}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 2 }}>
                                        <span style={{ fontWeight: 500, color: "#38bdf8" }}>@{agent}</span>
                                        <span style={{ color: "#94a3b8" }}>
                                            {formatNumber(stats.tokens)} tokens · {stats.calls} calls · {formatCost(stats.cost)}
                                        </span>
                                    </div>
                                    <div style={{ height: 8, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
                                        <div style={{
                                            height: "100%",
                                            width: `${barWidth}%`,
                                            background: stats.cost > 0.1 ? "#f43f5e" : stats.cost > 0.05 ? "#eab308" : "#22c55e",
                                            borderRadius: 4,
                                            transition: "width 0.3s ease",
                                            minWidth: barWidth > 0 ? 4 : 0,
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Actions by Token Usage */}
                <div className="card">
                    <div className="card-header">
                        <h2>Top Actions by Token Usage</h2>
                        <span className="badge">{Object.keys(metrics.byAction).length} unique actions</span>
                    </div>
                    <div className="list-container">
                        {Object.entries(metrics.byAction)
                            .sort((a, b) => b[1].tokens - a[1].tokens)
                            .slice(0, 15)
                            .map(([action, stats]) => {
                                const isExpensive = stats.tokens > 10000;
                                const isRead = action.includes("read") || action.includes("list");
                                const isWrite = action.includes("write") || action.includes("replace");
                                return (
                                    <div key={action} className="list-item" style={{ fontSize: "0.8rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{
                                                    width: 6, height: 6, borderRadius: "50%",
                                                    background: isExpensive ? "#ef4444" : isRead ? "#38bdf8" : isWrite ? "#22c55e" : "#64748b",
                                                    display: "inline-block"
                                                }} />
                                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>{action}</span>
                                            </div>
                                            <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
                                                {formatNumber(stats.tokens)} tokens · {stats.calls}x
                                            </span>
                                        </div>
                                        {isExpensive && (
                                            <div style={{ fontSize: "0.65rem", color: "#ef4444", marginTop: 2 }}>
                                                ⚠ High token consumption - consider optimizing
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        {Object.keys(metrics.byAction).length === 0 && <div className="empty-state">No actions recorded</div>}
                    </div>
                </div>
            </div>

            {/* Recent Activity Log */}
            <div className="card">
                <div className="card-header">
                    <h2>Recent Tool Activity</h2>
                    <span className="badge">{metrics.recentEntries.length} entries</span>
                </div>
                <div className="list-container">
                    {metrics.recentEntries.length === 0 && <div className="empty-state">No recent activity</div>}
                    {metrics.recentEntries.slice(-50).reverse().map((entry, idx) => (
                        <div key={idx} className="list-item" style={{ fontSize: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ color: "#64748b" }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                    <span style={{ color: "#38bdf8", fontWeight: 500 }}>@{entry.agent}</span>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#cbd5e1" }}>{entry.action}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ color: entry.estimatedTokens > 1000 ? "#eab308" : "#64748b" }}>
                                        {formatNumber(entry.estimatedTokens)} tok
                                    </span>
                                    <span style={{ color: "#64748b" }}>
                                        ~${(entry.estimatedTokens / 1000 * COST_PER_1K_TOKENS).toFixed(5)}
                                    </span>
                                    {entry.error && <span style={{ color: "#ef4444" }} title={entry.error}>⚠</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend & Notes */}
            <div style={{ fontSize: "0.75rem", color: "#64748b", padding: "8px 0", textAlign: "center" }}>
                <strong>Note:</strong> Token estimates are based on tool call payload sizes (1 token ≈ 4 characters).
                Actual token usage may vary by AI provider. Pricing based on ~${COST_PER_1K_TOKENS}/1K tokens (Claude Sonnet pricing).
                Does not include AI response tokens or system prompt tokens.
            </div>
        </div>
    );
}
