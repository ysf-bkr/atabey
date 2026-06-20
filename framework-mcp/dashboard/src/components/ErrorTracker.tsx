import { AlertTriangle, Bug, CheckCircle, ShieldAlert, Siren, TestTube } from "lucide-react";
import { useState } from "react";
import { useWS } from "../hooks/useWS";

interface ErrorItem {
    id: string;
    timestamp: string;
    agent: string;
    type: "lint" | "compliance" | "test" | "runtime" | "security";
    message: string;
    file?: string;
    line?: number;
    resolved: boolean;
}

const TYPE_ICONS: Record<string, typeof Bug> = {
    lint: Bug,
    compliance: ShieldAlert,
    test: TestTube,
    runtime: Siren,
    security: AlertTriangle,
};

export function ErrorTracker() {
    const [errors, setErrors] = useState<ErrorItem[]>([]);
    const [filter, setFilter] = useState("ALL");
    const [showResolved, setShowResolved] = useState(false);

    useWS({ handlers: { error: (d) => {
        const err = d as unknown as ErrorItem;
        if (err.id) setErrors(prev => [err, ...prev].slice(0, 100));
    }}});

    const filtered = errors.filter(e => {
        if (filter !== "ALL" && e.type !== filter) return false;
        if (!showResolved && e.resolved) return false;
        return true;
    });

    const activeCount = errors.filter(e => !e.resolved).length;

    const ERROR_COLORS: Record<string, string> = {
        lint: "#eab308",
        compliance: "#ef4444",
        test: "#3b82f6",
        runtime: "#ef4444",
        security: "#a855f7",
    };

    return <div className="card">
        <div className="card-header">
            <h2><AlertTriangle size={20} /> Policy & Audit Exceptions</h2>
            <span className="badge" style={{ background: activeCount > 0 ? "var(--color-accent-glow)" : "var(--color-border)", color: activeCount > 0 ? "var(--color-accent-primary)" : "var(--color-text-secondary)" }}>
                {activeCount} active
            </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="filter-tabs" style={{ margin: 0 }}>
                {["ALL", "lint", "compliance", "test", "runtime", "security"].map(f => (
                    <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                        {f.toUpperCase()}
                    </button>
                ))}
            </div>
            <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
                Show resolved
            </label>
        </div>

        <div className="list-container">
            {filtered.length === 0 && <div className="empty-state">No errors tracked</div>}
            {filtered.map(err => {
                const color = ERROR_COLORS[err.type] || "#64748b";
                const TypeIcon = TYPE_ICONS[err.type] || AlertTriangle;
                return <div key={err.id} className="list-item" style={{
                    borderLeft: `3px solid ${color}`,
                    opacity: err.resolved ? 0.5 : 1,
                }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: "0.8rem" }}>
                        <span style={{ color: "#64748b" }}>{new Date(err.timestamp).toLocaleTimeString()}</span>
                        <span style={{ color: "#38bdf8", fontWeight: 500, fontSize: "0.75rem" }}>{err.agent}</span>
                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.65rem", background: `${color}20`, color, display: "flex", alignItems: "center", gap: 3 }}>
                            <TypeIcon size={10} />{err.type}
                        </span>
                        {err.file && <span className="trace-id" style={{ fontSize: "0.65rem" }}>{err.file}:{err.line}</span>}
                        {err.resolved && <span style={{ color: "#22c55e", fontSize: "0.65rem", display: "flex", alignItems: "center", gap: 2 }}><CheckCircle size={10} /> Resolved</span>}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#f87171", wordBreak: "break-word" }}>
                        {err.message}
                    </div>
                </div>;
            })}
        </div>
    </div>;
}
