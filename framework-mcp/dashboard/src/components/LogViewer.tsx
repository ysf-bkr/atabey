import { ScrollText } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";

interface LogEntry {
    id?: number;
    timestamp: string;
    agent: string;
    action: string;
    summary: string;
    traceId?: string;
    status?: string;
}

const LOG_COLORS: Record<string, string> = {
    SUCCESS: "#22c55e", ERROR: "#ef4444", FAIL: "#ef4444",
    WARN: "#eab308", INFO: "#3b82f6", DEBUG: "#64748b",
    PENDING: "#eab308", APPROVED: "#22c55e", REJECTED: "#ef4444",
    BLOCKED: "#ef4444", TIMEOUT: "#ef4444",
};

export function LogViewer() {
    const { data: initial, loading } = useApi<LogEntry[]>("/logs", 5000);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState("ALL");
    const [agentFilter, setAgentFilter] = useState("ALL");

    useWS({ handlers: { log: (d) => {
        const data = d as { logs: LogEntry[] };
        if (data.logs) setLogs(prev => [...data.logs, ...prev].slice(0, 200));
    }}});

    const list = logs.length ? logs : (Array.isArray(initial) ? initial : []);
    if (Array.isArray(initial) && logs.length === 0 && initial.length > 0) setLogs(initial);

    const agents = [...new Set(list.map(l => l.agent))].filter(Boolean);

    const filtered = list.filter(l => {
        if (filter !== "ALL" && l.status !== filter && l.action !== filter) return false;
        if (agentFilter !== "ALL" && l.agent !== agentFilter) return false;
        return true;
    });

    return <div className="card">
        <div className="card-header">
            <h2><ScrollText size={20} /> Audit Logs</h2>
            <span className="badge">{list.length} entries</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "0.8rem" }}>
                <option value="ALL">All Specialists</option>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="filter-tabs" style={{ margin: 0 }}>
                {["ALL", "SUCCESS", "ERROR", "WARN", "INFO", "DEBUG"].map(f => (
                    <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
            </div>
        </div>

        {loading && !list.length && <div className="empty-state">Loading logs...</div>}

        <div className="list-container">
            {filtered.length === 0 && <div className="empty-state">No log entries</div>}
            {filtered.slice(0, 100).map((log, idx) => {
                const color = LOG_COLORS[log.status || log.action] || "#64748b";
                return <div key={log.id || idx} className="list-item" style={{ borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: "0.8rem" }}>
                        <span style={{ color: "#64748b" }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span style={{ color: "#38bdf8", fontWeight: 500, fontSize: "0.75rem" }}>{log.agent}</span>
                        <span style={{
                            padding: "1px 6px", borderRadius: 3, fontSize: "0.65rem",
                            background: `${color}20`, color,
                        }}>{log.status || log.action}</span>
                        {log.traceId && <span className="trace-id" style={{ fontSize: "0.65rem" }}>{log.traceId}</span>}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#cbd5e1", wordBreak: "break-word" }}>
                        <strong style={{ color: "#e2e8f0" }}>{log.action}</strong>: {log.summary}
                    </div>
                </div>;
            })}
        </div>
    </div>;
}
