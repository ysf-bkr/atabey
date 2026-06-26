import { Activity, AlertTriangle, FileText } from "lucide-react";
import { useEffect, useState } from "react";

interface QualityIssue {
    file: string;
    type: string;
    message: string;
}

interface QualityData {
    totalFiles: number;
    totalIssues: number;
    longFunctions: number;
    deepNesting: number;
    anyTypes: number;
    issues: QualityIssue[];
}

export function QualityPanel() {
    const [data, setData] = useState<QualityData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchQuality = () => {
            fetch("/api/quality?path=src")
                .then(r => r.json())
                .then(d => {
                    if (d.success) setData(d.data);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        };
        fetchQuality();
        const interval = setInterval(fetchQuality, 10000);
        return () => clearInterval(interval);
    }, []);

    const ISSUE_COLORS: Record<string, string> = {
        "any-type": "#ef4444",
        complexity: "#f59e0b",
    };

    return (
        <div className="card">
            <div className="card-header">
                <h2><Activity size={20} /> Quality Gate Analysis</h2>
                {data && (
                    <span className="badge" style={{ background: data.totalIssues > 0 ? "var(--color-accent-glow)" : "var(--color-border)", color: data.totalIssues > 0 ? "var(--color-accent-primary)" : "var(--color-text-secondary)" }}>
                        {data.totalIssues} issues
                    </span>
                )}
            </div>

            {loading && <div className="empty-state">Analyzing codebase...</div>}

            {data && (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", margin: "0 0 12px 0" }}>
                        <div className="stat-box">
                            <span className="stat-count" style={{ color: data.anyTypes > 0 ? "var(--color-accent-primary)" : "#22c55e" }}>{data.anyTypes}</span>
                            <span className="stat-label">any types</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-count" style={{ color: data.longFunctions > 0 ? "#f59e0b" : "#22c55e" }}>{data.longFunctions}</span>
                            <span className="stat-label">long funcs</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-count" style={{ color: data.deepNesting > 0 ? "#f59e0b" : "#22c55e" }}>{data.deepNesting}</span>
                            <span className="stat-label">deep nesting</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-count">{data.totalFiles}</span>
                            <span className="stat-label"><FileText size={12} style={{ display: "inline", marginRight: 2 }} />files scanned</span>
                        </div>
                    </div>

                    <div className="list-container" style={{ maxHeight: 200 }}>
                        {data.issues.length === 0 && <div className="empty-state">No quality issues found</div>}
                        {data.issues.map((issue, i) => {
                            const color = ISSUE_COLORS[issue.type] || "#64748b";
                            return (
                                <div key={i} className="list-item" style={{ borderLeft: `3px solid ${color}` }}>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2, fontSize: "0.75rem" }}>
                                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.65rem", background: `${color}20`, color, display: "flex", alignItems: "center", gap: 2 }}>
                                            <AlertTriangle size={10} />{issue.type}
                                        </span>
                                        <span className="trace-id" style={{ fontSize: "0.65rem" }}>{issue.file}</span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>{issue.message}</div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
