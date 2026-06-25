import { Cpu, Lock, Monitor, Network, RefreshCw, Server, Share2, ShieldCheck, Unlock, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

interface MCPStatus {
    mode: "unified" | "stdio";
    port: number;
    host: string;
    sessions: number;
    version: string;
    dashboardUrl: string;
    mcpSseUrl: string;
    isLocal: boolean;
}

interface AuthInfo {
    enabled: boolean;
    hasToken: boolean;
    hasUsers: boolean;
}


export function MCPSetupPanel() {
    const [status, setStatus] = useState<MCPStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [authInfo, setAuthInfo] = useState<AuthInfo>({ enabled: false, hasToken: false, hasUsers: false });

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/health");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            const port = window.location.port || "5858";
            const hostname = window.location.hostname;

            setStatus({
                mode: "unified",
                port: parseInt(port),
                host: hostname,
                sessions: 0,
                version: json.version || "0.0.14",
                dashboardUrl: `http://${hostname}:${port}`,
                mcpSseUrl: `http://${hostname}:${port}/mcp/sse`,
                isLocal,
            });

            // Auth check - try to access a protected endpoint without auth
            try {
                const checkRes = await fetch("/api/mcp/sessions", { headers: {} });
                if (checkRes.status === 401) {
                    setAuthInfo({ enabled: true, hasToken: true, hasUsers: false });
                } else {
                    setAuthInfo({ enabled: false, hasToken: false, hasUsers: false });
                }
            } catch {
                setAuthInfo({ enabled: true, hasToken: true, hasUsers: false });
            }

            // Get session count and user details
            try {
                const token = localStorage.getItem("atabey-auth-token") || "";
                const headers: Record<string, string> = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }
                const sessionRes = await fetch("/api/mcp/sessions", { headers });
                if (sessionRes.ok) {
                    const sessionJson = await sessionRes.json();
                    if (sessionJson.success && sessionJson.data) {
                        setStatus(prev => prev ? { ...prev, sessions: sessionJson.data.total || 0 } : prev);
                    }
                }
            } catch { /* ignore - legacy dashboard server may not have this endpoint */ }

            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(label);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    if (loading && !status) {
        return <div className="card"><div className="empty-state">Loading MCP Configuration...</div></div>;
    }

    if (error && !status) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><Server size={20} style={{ color: "#ef4444" }} /> MCP Setup Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const s = status!;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header */}
            <div className="card" style={{
                background: s.isLocal
                    ? "linear-gradient(135deg, #0f172a 0%, #2a0a0a 100%)"
                    : "linear-gradient(135deg, #2a0a0a 0%, #0f172a 100%)",
                border: "1px solid #312e81"
            }}>
                <div className="card-header" style={{ borderBottom: "1px solid #312e81" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Server size={28} style={{ color: "#ef4444" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#f8fafc" }}>MCP Server Configuration</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                                {s.isLocal ? "Local mode - only you can connect" : "Network mode - team can connect"}
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchStatus} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                {/* Mode & Connection Status */}
                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <Monitor size={16} style={{ color: "#ef4444" }} />
                            <span className="stat-title">Server Mode</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.2rem", color: "#ef4444" }}>
                            {s.mode === "unified" ? "Unified" : "Stdio"}
                        </div>
                        <div className="stat-card-desc">MCP + Dashboard on single port</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <Wifi size={16} style={{ color: s.isLocal ? "#eab308" : "#22c55e" }} />
                            <span className="stat-title">Access Type</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.2rem", color: s.isLocal ? "#eab308" : "#22c55e" }}>
                            {s.isLocal ? "Local" : "Network"}
                        </div>
                        <div className="stat-card-desc">{s.isLocal ? "Only this machine" : "Accessible from LAN"}</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <Lock size={16} style={{ color: authInfo.enabled ? "#22c55e" : "#eab308" }} />
                            <span className="stat-title">Authentication</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.2rem", color: authInfo.enabled ? "#22c55e" : "#eab308" }}>
                            {authInfo.enabled ? "Protected" : "Open"}
                        </div>
                        <div className="stat-card-desc">{authInfo.enabled ? "MCP_AUTH_TOKEN set" : "No auth configured"}</div>
                    </div>

                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            <Share2 size={16} style={{ color: "#22c55e" }} />
                            <span className="stat-title">Active Sessions</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.2rem", color: "#22c55e" }}>
                            {s.sessions}
                        </div>
                        <div className="stat-card-desc">Connected AI clients</div>
                    </div>
                </div>
            </div>

            {/* Security Callout */}
            <div className="card" style={{ borderColor: authInfo.enabled ? "#22c55e" : "#eab308" }}>
                <div className="card-header">
                    <h2>
                        {authInfo.enabled ? <ShieldCheck size={18} style={{ color: "#22c55e" }} /> : <Unlock size={18} style={{ color: "#eab308" }} />}
                        Server Security
                    </h2>
                    {authInfo.enabled
                        ? <span className="badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>🔒 Protected</span>
                        : <span className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "#eab308" }}>⚠ Open Access</span>
                    }
                </div>
                <div style={{ padding: "0 12px 12px", fontSize: "0.85rem", color: "#94a3b8" }}>
                    {authInfo.enabled ? (
                        <p style={{ margin: 0 }}>
                            <strong style={{ color: "#22c55e" }}>Authentication active.</strong> All API/MCP requests require
                            <code style={{ fontFamily: "monospace", color: "#ef4444", background: "#1a1a1a", padding: "1px 4px", borderRadius: 2 }}>{' Authorization: Bearer <token> '}</code>
                            header. Dashboard static files are public.
                        </p>
                    ) : (
                        <p style={{ margin: 0 }}>
                            <strong style={{ color: "#eab308" }}>Warning: Authentication is off.</strong> Anyone who can reach the server can access all APIs.
                            To protect: <code style={{ fontFamily: "monospace", color: "#ef4444", background: "#1a1a1a", padding: "1px 4px", borderRadius: 2 }}>MCP_AUTH_TOKEN=your-secret-key</code>
                        </p>
                    )}
                </div>
            </div>

            {/* Configuration Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                {/* Local Setup */}
                <div className="card" style={{ borderColor: "#1e293b" }}>
                    <div className="card-header">
                        <h2><Monitor size={18} /> Local Setup (Solo)</h2>
                        <span className="badge" style={{ background: "rgba(234, 179, 8, 0.1)", color: "#eab308" }}>Single Dev</span>
                    </div>
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                            Each developer runs on their own machine. Only their own IDE connects.
                        </p>

                        <div style={{ fontSize: "0.8rem" }}>
                            <div style={{ color: "#64748b", marginBottom: 4 }}>Terminal:</div>
                            <div
                                onClick={() => copyToClipboard("atabey mcp start", "local-cmd")}
                                style={{
                                    padding: "8px 12px", background: "#090d16", borderRadius: 4,
                                    fontFamily: "monospace", color: "#ef4444", cursor: "pointer",
                                    border: "1px solid #1e293b", fontSize: "0.8rem"
                                }}
                            >
                                atabey mcp start
                                <span style={{ float: "right", color: copied === "local-cmd" ? "#22c55e" : "#64748b" }}>
                                    {copied === "local-cmd" ? "✓ Copied" : "📋"}
                                </span>
                            </div>
                        </div>

                        <div style={{ fontSize: "0.8rem" }}>
                            <div style={{ color: "#64748b", marginBottom: 4 }}>mcp.json:</div>
                            <div
                                onClick={() => copyToClipboard(JSON.stringify({ mcpServers: { atabey: { command: "atabey", args: ["mcp", "start"] } } }, null, 2), "local-json")}
                                style={{
                                    padding: "8px 12px", background: "#090d16", borderRadius: 4,
                                    fontFamily: "monospace", color: "#22c55e", cursor: "pointer",
                                    border: "1px solid #1e293b", fontSize: "0.75rem", whiteSpace: "pre-wrap"
                                }}
                            >
{`{
  "mcpServers": {
    "atabey": {
      "command": "atabey",
      "args": ["mcp", "start"]
    }
  }
}`}
                                <span style={{ float: "right", color: copied === "local-json" ? "#22c55e" : "#64748b" }}>
                                    {copied === "local-json" ? "✓ Copied" : "📋"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Network/Team Setup */}
                <div className="card" style={{ borderColor: "#312e81" }}>
                    <div className="card-header">
                        <h2><Network size={18} /> Network Setup (Team)</h2>
                        <span className="badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>Multi-Dev</span>
                    </div>
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                            Single server serves the entire team. Everyone connects to the same MCP.
                        </p>

                        <div style={{ fontSize: "0.8rem" }}>
                            <div style={{ color: "#64748b", marginBottom: 4 }}>Server (one person runs):</div>
                            <div
                                onClick={() => copyToClipboard("MCP_HOST=0.0.0.0 MCP_AUTH_TOKEN=secret-key atabey mcp start", "net-cmd")}
                                style={{
                                    padding: "8px 12px", background: "#090d16", borderRadius: 4,
                                    fontFamily: "monospace", color: "#ef4444", cursor: "pointer",
                                    border: "1px solid #1e293b", fontSize: "0.8rem"
                                }}
                            >
                                MCP_HOST=0.0.0.0 MCP_AUTH_TOKEN=secret-key atabey mcp start
                                <span style={{ float: "right", color: copied === "net-cmd" ? "#22c55e" : "#64748b" }}>
                                    {copied === "net-cmd" ? "✓ Copied" : "📋"}
                                </span>
                            </div>
                        </div>

                        <div style={{ fontSize: "0.8rem" }}>
                            <div style={{ color: "#64748b", marginBottom: 4 }}>Each developer's mcp.json:</div>
                            <div
                                onClick={() => copyToClipboard(JSON.stringify({ mcpServers: { atabey: { url: s.mcpSseUrl, headers: { Authorization: "Bearer secret-key" }, env: { ATABEY_PROJECT_ROOT: "/path/to/project" } } } }, null, 2), "net-json")}
                                style={{
                                    padding: "8px 12px", background: "#090d16", borderRadius: 4,
                                    fontFamily: "monospace", color: "#22c55e", cursor: "pointer",
                                    border: "1px solid #1e293b", fontSize: "0.75rem", whiteSpace: "pre-wrap"
                                }}
                            >
{`{
  "mcpServers": {
    "atabey": {
      "url": "${s.mcpSseUrl}",
      "headers": {
        "Authorization": "Bearer secret-key"
      },
      "env": {
        "ATABEY_PROJECT_ROOT": "/path/to/project"
      }
    }
  }
}`}
                                <span style={{ float: "right", color: copied === "net-json" ? "#22c55e" : "#64748b" }}>
                                    {copied === "net-json" ? "✓ Copied" : "📋"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Environment Variables */}
            <div className="card">
                <div className="card-header">
                    <h2><Cpu size={18} /> Environment Variables</h2>
                </div>
                <div style={{ padding: 12 }}>
                    <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b" }}>
                                <th style={{ textAlign: "left", padding: "6px 8px" }}>Variable</th>
                                <th style={{ textAlign: "left", padding: "6px 8px" }}>Default</th>
                                <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: "1px solid #1e293b" }}>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>MCP_TRANSPORT</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>unified</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>
                                    <strong>unified</strong> (recommended): MCP + Dashboard on single port<br />
                                    <strong>stdio</strong>: MCP only, dashboard separate
                                </td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #1e293b" }}>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>MCP_AUTH_TOKEN</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>-</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>
                                    <strong style={{ color: "#22c55e" }}>Security!</strong> API Key. If set, all requests require <code>{'Authorization: Bearer <token>'}</code>.
                                </td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #1e293b" }}>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>MCP_AUTH_USERS</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>-</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>
                                    Per-user tokens: <code>ali:key1,veli:key2</code>
                                </td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #1e293b" }}>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>MCP_PORT</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>5858</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>Server port</td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #1e293b" }}>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>MCP_HOST</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>0.0.0.0</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>
                                    <strong>0.0.0.0</strong>: Open (network)<br />
                                    <strong>localhost</strong>: Secure (solo)
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#ef4444" }}>ATABEY_PROJECT_ROOT</td>
                                <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b" }}>process.cwd()</td>
                                <td style={{ padding: "8px", color: "#94a3b8" }}>Project root directory (required in SSE mode)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Reference */}
            <div className="card">
                <div className="card-header">
                    <h2>Quick Reference</h2>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                        <span style={{ color: "#94a3b8" }}>Dashboard URL</span>
                        <span onClick={() => copyToClipboard(s.dashboardUrl, "dash-url")} style={{ fontFamily: "monospace", color: "#ef4444", cursor: "pointer" }}>
                            {s.dashboardUrl} {copied === "dash-url" ? "✓" : "📋"}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                        <span style={{ color: "#94a3b8" }}>MCP SSE URL</span>
                        <span onClick={() => copyToClipboard(s.mcpSseUrl, "sse-url")} style={{ fontFamily: "monospace", color: "#22c55e", cursor: "pointer" }}>
                            {s.mcpSseUrl} {copied === "sse-url" ? "✓" : "📋"}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                        <span style={{ color: "#94a3b8" }}>WebSocket URL</span>
                        <span style={{ fontFamily: "monospace", color: "#a78bfa" }}>ws://{s.host}:{s.port}/ws</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                        <span style={{ color: "#94a3b8" }}>API Health</span>
                        <span style={{ fontFamily: "monospace", color: "#22c55e" }}>http://{s.host}:{s.port}/api/health</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
