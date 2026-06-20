import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";

interface ComplianceResult {
    file: string; status: "PASS" | "FAIL" | "WARN"; violations: string[];
}

export function CompliancePanel() {
    const { data: results, loading, error } = useApi<ComplianceResult[]>("/compliance", 15000);
    const [filter, setFilter] = useState("ALL");
    const [expanded, setExpanded] = useState<string | null>(null);

    const list = Array.isArray(results) ? results : [];

    const filtered = filter === "ALL" ? list : list.filter(r => r.status === filter);
    const stats = {
        PASS: list.filter(r => r.status === "PASS").length,
        FAIL: list.filter(r => r.status === "FAIL").length,
        WARN: list.filter(r => r.status === "WARN").length,
    };

    return <div className="card">
        <div className="card-header">
            <h2><CheckCircle size={20} /> Compliance Auditing</h2>
            <span className="badge">{list.length} files</span>
        </div>

        {loading && !list.length && <div className="empty-state">Running checks...</div>}
        {error && !list.length && <div className="error">Error: {error}</div>}

        {list.length > 0 && <>
            <div className="stats-grid">
                {Object.entries(stats).map(([k, v]) => (
                    <div key={k} className={`stat-box ${k.toLowerCase()}`}>
                        <span className="stat-count">{v}</span>
                        <span className="stat-label">{k}</span>
                    </div>
                ))}
            </div>

            <div className="filter-tabs">
                {["ALL", "PASS", "FAIL", "WARN"].map(f => (
                    <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
            </div>

            <div className="list-container">
                {filtered.length === 0 && <div className="empty-state">No results</div>}
                {filtered.map(r => {
                    const open = expanded === r.file;
                    return <div key={r.file} className="list-item" onClick={() => setExpanded(open ? null : r.file)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {r.status === "PASS" ? <CheckCircle size={14} style={{ color: "#22c55e", flexShrink: 0 }} /> :
                             r.status === "FAIL" ? <XCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} /> :
                             <AlertTriangle size={14} style={{ color: "#eab308", flexShrink: 0 }} />}
                            <span style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>{r.file}</span>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: r.status === "PASS" ? "#22c55e" : r.status === "FAIL" ? "#ef4444" : "#eab308" }}>{r.status}</span>
                        </div>
                        {open && r.violations.length > 0 && (
                            <div style={{ marginTop: 8, borderTop: "1px solid #334155", paddingTop: 8 }}>
                                {r.violations.map((v, i) => (
                                    <div key={i} style={{ fontSize: "0.8rem", color: "#ef4444", marginTop: 4 }}><AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />{v}</div>
                                ))}
                            </div>
                        )}
                    </div>;
                })}
            </div>
        </>}
    </div>;
}
