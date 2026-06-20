import { Activity, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * HermesStats — Live Hermes message queue statistics.
 * Message categories, statuses, and queue depth.
 */
export function HermesStats() {
    const [stats, setStats] = useState<{
        total: number;
        pending: number;
        byCategory: Record<string, number>;
        byStatus: Record<string, number>;
    } | null>(null);

    useEffect(() => {
        const fetchStats = () => {
            fetch("/api/hermes/stats")
                .then(r => r.json())
                .then(d => { if (d.success) setStats(d.data); })
                .catch(() => {});
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const CATEGORY_COLORS: Record<string, string> = {
        DELEGATION: "#3b82f6",
        ACTION: "#f59e0b",
        ALERT: "#ef4444",
        SUBTASK: "#8b5cf6",
        REPLY: "#22c55e",
    };

    return (
        <div className="card">
            <div className="card-header">
                <h2><BarChart3 size={20} /> Hermes Queue</h2>
                {stats && (
                    <span className="badge" style={{ background: stats.pending > 0 ? "rgba(59, 130, 246, 0.15)" : "var(--color-border)", color: stats.pending > 0 ? "#3b82f6" : "var(--color-text-secondary)" }}>
                        {stats.pending} pending / {stats.total} total
                    </span>
                )}
            </div>

            {!stats && <div className="empty-state">Loading queue stats...</div>}

            {stats && (
                <>
                    {/* Category Breakdown */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>BY CATEGORY</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {Object.entries(stats.byCategory).map(([cat, count]) => {
                                const color = CATEGORY_COLORS[cat] || "#64748b";
                                const maxCount = Math.max(...Object.values(stats.byCategory), 1);
                                const width = (count / maxCount) * 100;
                                return (
                                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                                        <span style={{ width: 80, color, fontWeight: 500 }}>{cat}</span>
                                        <div style={{ flex: 1, height: 14, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 3, overflow: "hidden" }}>
                                            <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 3, opacity: 0.7 }} />
                                        </div>
                                        <span style={{ width: 30, textAlign: "right", color: "var(--color-text-primary)" }}>{count}</span>
                                    </div>
                               );
                            })}
                        </div>
                    </div>

                    {/* Status Breakdown */}
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>BY STATUS</div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {Object.entries(stats.byStatus).map(([status, count]) => (
                                <div key={status} style={{
                                    padding: "6px 12px",
                                    borderRadius: 6,
                                    background: "var(--color-bg)",
                                    border: "1px solid var(--color-border)",
                                    fontSize: "0.8rem",
                                }}>
                                    <span style={{ color: "var(--color-text-secondary)", marginRight: 6 }}>{status}</span>
                                    <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Queue Depth Gauge */}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 4 }}><Activity size={12} style={{ display: "inline", marginRight: 4 }} />QUEUE DEPTH</div>
                        <div style={{ height: 20, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{
                                width: `${Math.min((stats.pending / Math.max(stats.total, 1)) * 100, 100)}%`,
                                height: "100%",
                                background: stats.pending > 10 ? "#f59e0b" : stats.pending > 0 ? "#3b82f6" : "#22c55e",
                                borderRadius: 10,
                                transition: "width 0.5s ease",
                            }} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
