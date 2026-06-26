import { Activity, AlertTriangle, CheckCircle, Cloud, Database, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

interface TelemetryStatus {
    enabled: boolean;
    serverUrl: string;
    queueSize: number;
    wsConnected: boolean;
    eventsThisMinute: number;
    config: {
        BATCH_SIZE: number;
        FLUSH_INTERVAL_MS: number;
        MAX_RETRIES: number;
        MAX_EVENTS_PER_MINUTE: number;
        USE_WEBSOCKET: boolean;
        AUTH_TOKEN: string;
    };
}

export function TelemetryPanel() {
    const [status, setStatus] = useState<TelemetryStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/telemetry");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setStatus(json.data);
            } else {
                throw new Error(json.error || "Failed to fetch telemetry status");
            }
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

    if (loading && !status) {
        return <div className="card"><div className="empty-state">Loading Telemetry Status...</div></div>;
    }

    if (error && !status) {
        return (
            <div className="card">
                <div className="card-header">
                    <h2><AlertTriangle size={20} style={{ color: "var(--color-error)" }} /> Telemetry Error</h2>
                </div>
                <div className="error" style={{ padding: 16 }}>{error}</div>
            </div>
        );
    }

    const isConnected = status?.serverUrl && status.serverUrl.length > 0;
    const ratePercent = status ? (status.eventsThisMinute / (status.config?.MAX_EVENTS_PER_MINUTE || 200)) * 100 : 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #0a1a2a 100%)", border: "1px solid #1e3a5f" }}>
                <div className="card-header" style={{ borderBottom: "1px solid #1e3a5f" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Cloud size={28} style={{ color: isConnected ? "var(--color-success)" : "var(--color-text-soft)" }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-heading)" }}>Telemetry Streamer</h2>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-soft)" }}>
                                Edge-to-Cloud Event Streaming
                            </p>
                        </div>
                    </div>
                    <button className="sidebar-btn" onClick={fetchStatus} style={{ width: "auto", padding: "6px 12px" }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
                    </button>
                </div>

                <div className="quick-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "16px 0 0 0" }}>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            {status?.enabled ? <CheckCircle size={16} style={{ color: "var(--color-success)" }} /> : <AlertTriangle size={16} style={{ color: "var(--color-warning)" }} />}
                            <span className="stat-title">Status</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: status?.enabled ? "var(--color-success)" : "var(--color-warning)" }}>
                            {status?.enabled ? "Active" : "Disabled"}
                        </div>
                        <div className="stat-card-desc">{status?.enabled ? "Streaming enabled" : "Telemetry off"}</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header">
                            {isConnected ? <Wifi size={16} style={{ color: "var(--color-success)" }} /> : <WifiOff size={16} style={{ color: "var(--color-text-soft)" }} />}
                            <span className="stat-title">Server</span>
                        </div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem", color: isConnected ? "var(--color-success)" : "var(--color-text-soft)" }}>
                            {isConnected ? "Connected" : "Offline"}
                        </div>
                        <div className="stat-card-desc">{isConnected ? new URL(status!.serverUrl).hostname : "No server configured"}</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Database size={16} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">Queue</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{status?.queueSize || 0}</div>
                        <div className="stat-card-desc">Pending events</div>
                    </div>
                    <div className="stat-card" style={{ background: "#111827", borderColor: "#1f2937" }}>
                        <div className="stat-card-header"><Activity size={16} style={{ color: ratePercent > 80 ? "var(--color-warning)" : "var(--color-accent-primary)" }} /><span className="stat-title">Rate</span></div>
                        <div className="stat-card-value" style={{ fontSize: "1.5rem" }}>{status?.eventsThisMinute || 0}/min</div>
                        <div className="stat-card-desc">Events this minute</div>
                    </div>
                </div>

                {status?.wsConnected && (
                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: 6, color: "var(--color-success)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                        <Wifi size={14} /> WebSocket connected — real-time streaming active
                    </div>
                )}

                {!isConnected && status?.enabled && (
                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6, color: "var(--color-warning)", fontSize: "0.85rem" }}>
                        ⚠️ Telemetry enabled but no server URL configured. Events will be saved to local fallback.
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Stream Configuration</h2>
                </div>
                <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Server URL</div>
                        <div style={{ fontSize: "0.85rem", color: status?.serverUrl ? "var(--color-accent-primary)" : "var(--color-text-soft)" }}>
                            {status?.serverUrl || "Not configured"}
                        </div>
                    </div>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Batch Size</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-heading)" }}>{status?.config?.BATCH_SIZE || 50} events</div>
                    </div>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Flush Interval</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-heading)" }}>{(status?.config?.FLUSH_INTERVAL_MS || 30000) / 1000}s</div>
                    </div>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Max Retries</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-heading)" }}>{status?.config?.MAX_RETRIES || 3}</div>
                    </div>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Rate Limit</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-heading)" }}>{status?.config?.MAX_EVENTS_PER_MINUTE || 200}/min</div>
                    </div>
                    <div style={{ background: "#111827", padding: "10px 12px", borderRadius: 6, border: "1px solid #1f2937" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-dim)", marginBottom: 2 }}>Transport</div>
                        <div style={{ fontSize: "0.85rem", color: status?.config?.USE_WEBSOCKET ? "var(--color-success)" : "var(--color-accent-primary)" }}>
                            {status?.config?.USE_WEBSOCKET ? "WebSocket" : "HTTPS Batch"}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2>Data Flow Diagram</h2>
                </div>
                <div style={{ padding: 16, fontSize: "0.75rem", color: "var(--color-dim)", fontFamily: "monospace", lineHeight: 1.8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--color-accent-primary)" }}>[Local MCP]</span>
                        <span>→</span>
                        <span style={{ color: "var(--color-warning)" }}>SQLite Queue</span>
                        <span>→</span>
                        <span style={{ color: "var(--color-accent-muted)" }}>Batch Processor</span>
                        <span>→</span>
                        <span style={{ color: isConnected ? "var(--color-success)" : "var(--color-text-soft)" }}>
                            {status?.config?.USE_WEBSOCKET ? "WebSocket" : "HTTPS"}
                        </span>
                        <span>→</span>
                        <span style={{ color: isConnected ? "var(--color-success)" : "var(--color-text-soft)" }}>
                            {isConnected ? "[Enterprise Server]" : "[Local Fallback JSONL]"}
                        </span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>🔒 PII masked before transmission</span>
                        <span>🔄 Retry with exponential backoff</span>
                        <span>📁 Fallback: {status?.serverUrl ? "pending-events.jsonl" : "local storage"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
