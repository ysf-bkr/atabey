import { AlertTriangle, BookOpen, CheckCircle, FileCode, RefreshCw, ShieldBan } from "lucide-react";
import { useEffect, useState } from "react";

interface LicenseMatch {
    license: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    spdxId: string;
    source: "header" | "spdx" | "snippet" | "comment";
    line: number;
    snippet: string;
    blocked: boolean;
    requiresAttribution: boolean;
}

interface LicenseSummary {
    hasBlocked: boolean;
    highestSeverity: string;
    requiresAttribution: boolean;
    uniqueLicenses: string[];
}

export function LicensePanel() {
    const [config, setConfig] = useState<Record<string, unknown> | null>(null);
    const [scanPath, setScanPath] = useState("src");
    const [scanContent, setScanContent] = useState("");
    const [matches, setMatches] = useState<LicenseMatch[]>([]);
    const [summary, setSummary] = useState<LicenseSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchConfig = async () => {
        try {
            const res = await fetch("/api/license");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setConfig(json.data.config);
            }
        } catch { /* ignore */ }
    };

    const scanLicense = async () => {
        if (!scanPath || !scanContent) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/license?path=${encodeURIComponent(scanPath)}&content=${encodeURIComponent(scanContent)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setMatches(json.data.matches || []);
                setSummary(json.data.summary);
            } else {
                throw new Error(json.error || "Scan failed");
            }
        } catch (err) {
            setError((err as Error).message);
            setMatches([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const severityColor = (severity: string) => {
        switch (severity) {
            case "CRITICAL": return "var(--color-error)";
            case "HIGH": return "var(--color-warning)";
            case "MEDIUM": return "var(--color-accent-primary)";
            case "LOW": return "var(--color-success)";
            default: return "var(--color-text-soft)";
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1a0a2a 100%)", border: "1px solid #5b21b6" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #5b21b6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <BookOpen size={28} style={{ color: "var(--color-accent-primary)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>License Compliance Scanner</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>
                                SPDX & Copyleft License Detection
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchConfig} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                {config && (
                    <div style={{ display: "flex", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
                        <span className="badge" style={{ background: "rgba(59, 130, 246, 0.1)", color: "var(--color-accent-primary)" }}>
                            Blocklist: {config.BLOCKLIST?.join(", ") || "N/A"}
                        </span>
                        <span className="badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-success)" }}>
                            Allowlist: {config.ALLOWLIST?.join(", ") || "N/A"}
                        </span>
                        <span className="badge" style={{ background: config.BLOCK_COPYLEFT ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)", color: config.BLOCK_COPYLEFT ? "var(--color-error)" : "var(--color-success)" }}>
                            Block Copyleft: {config.BLOCK_COPYLEFT ? "ON" : "OFF"}
                        </span>
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Scan Code for Licenses</h2>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                        <label style={{ fontSize: "0.8rem", color: "var(--color-text-soft)", marginBottom: 4, display: "block" }}>
                            File Path (e.g., src/component.ts)
                        </label>
                        <input
                            type="text"
                            value={scanPath}
                            onChange={(e) => setScanPath(e.target.value)}
                            placeholder="src/component.ts"
                            style={{ width: "100%", padding: "8px 12px", background: "#111827", color: "white", border: "1px solid #374151", borderRadius: 4, fontSize: "0.85rem" }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.8rem", color: "var(--color-text-soft)", marginBottom: 4, display: "block" }}>
                            Code Content
                        </label>
                        <textarea
                            value={scanContent}
                            onChange={(e) => setScanContent(e.target.value)}
                            placeholder="// SPDX-License-Identifier: MIT ..."
                            rows={6}
                            style={{ width: "100%", padding: "8px 12px", background: "#111827", color: "white", border: "1px solid #374151", borderRadius: 4, fontSize: "0.8rem", fontFamily: "monospace", resize: "vertical" }}
                        />
                    </div>
                    <button className="sidebar-btn" onClick={scanLicense} disabled={loading || !scanPath || !scanContent} style={{ width: "auto", padding: "8px 16px", alignSelf: "flex-start" }}>
                        {loading ? "Scanning..." : "Scan for Licenses"}
                    </button>
                    {error && <div style={{ color: "var(--color-error)", fontSize: "0.8rem" }}>{error}</div>}
                </div>
            </div>

            {summary && (
                <div className="card">
                    <div className="card-header">
                        <h2>Scan Results</h2>
                        {summary.hasBlocked && <span className="badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)" }}>⛔ Blocked</span>}
                    </div>
                    <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, padding: "16px" }}>
                        <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                            <div className="stat-card-header"><FileCode size={14} /><span className="stat-title">Licenses</span></div>
                            <div className="stat-card-value" style={{ fontSize: "1.3rem" }}>{summary.uniqueLicenses.length}</div>
                        </div>
                        <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                            <div className="stat-card-header"><ShieldBan size={14} style={{ color: summary.hasBlocked ? "var(--color-error)" : "var(--color-success)" }} /><span className="stat-title">Blocked</span></div>
                            <div className="stat-card-value" style={{ fontSize: "1.3rem", color: summary.hasBlocked ? "var(--color-error)" : "var(--color-success)" }}>{summary.hasBlocked ? "Yes" : "No"}</div>
                        </div>
                        <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                            <div className="stat-card-header"><CheckCircle size={14} style={{ color: summary.requiresAttribution ? "var(--color-warning)" : "var(--color-success)" }} /><span className="stat-title">Attribution</span></div>
                            <div className="stat-card-value" style={{ fontSize: "1.3rem" }}>{summary.requiresAttribution ? "Required" : "Not needed"}</div>
                        </div>
                        <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                            <div className="stat-card-header"><AlertTriangle size={14} style={{ color: severityColor(summary.highestSeverity) }} /><span className="stat-title">Severity</span></div>
                            <div className="stat-card-value" style={{ fontSize: "1.3rem", color: severityColor(summary.highestSeverity) }}>{summary.highestSeverity}</div>
                        </div>
                    </div>

                    <div className="list-container">
                        {matches.length === 0 && <div className="empty-state">No licenses detected</div>}
                        {matches.map((match, i) => (
                            <div key={i} className="list-item" style={{ borderLeft: `3px solid ${severityColor(match.severity)}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ color: severityColor(match.severity), fontWeight: 600 }}>{match.spdxId}</span>
                                        <span style={{ fontSize: "0.75rem", color: "var(--color-dim)" }}>{match.license}</span>
                                        {match.blocked && <span className="badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)" }}>BLOCKED</span>}
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--color-dim)" }}>
                                        Line {match.line} · {match.source}
                                    </div>
                                </div>
                                {match.snippet && (
                                    <div style={{ fontSize: "0.7rem", color: "var(--color-text-soft)", marginTop: 4, fontFamily: "monospace", background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {match.snippet}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
