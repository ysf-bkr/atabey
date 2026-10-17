import React, { useEffect, useState } from "react";
import { RefreshCw, Server, Copy, Check, AlertTriangle } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Button, EmptyState } from "./ui";

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
  const { t } = useI18n();
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<AuthInfo>({
    enabled: false,
    hasToken: false,
    hasUsers: false,
  });

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const port = window.location.port || "5858";
      const hostname = window.location.hostname;

      setStatus({
        mode: "unified",
        port: parseInt(port),
        host: hostname,
        sessions: 0,
        version: json.version || "0.0.38",
        dashboardUrl: `http://${hostname}:${port}`,
        mcpSseUrl: `http://${hostname}:${port}/mcp/sse`,
        isLocal,
      });

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

  const s = status;

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("nav.mcp")}
        description={t("page.settings.desc")}
        icon={<Server className="w-5 h-5 text-brand-purple" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            leftIcon={<RefreshCw size={13} />}
          >
            {t("common.refresh")}
          </Button>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-6">
        {loading && !s ? (
          <EmptyState
            icon={<Server className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("common.loading")}
          />
        ) : error && !s ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : (
          <>
            {/* Top Stat Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {s?.mode === "unified" ? "Unified" : "Stdio"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Server Mode
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    s?.isLocal ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {s?.isLocal ? "Localhost" : "LAN / Public"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Network Access
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    authInfo.enabled ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {authInfo.enabled ? "Protected" : "Open"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Token Auth
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  v{s?.version}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  MCP Version
                </span>
              </div>
            </div>

            {/* Quick Connection Code Blocks */}
            <div className="space-y-4 pt-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                IDE Client Configuration (Cursor / Claude / VS Code)
              </span>

              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-secondary">
                    claude_desktop_config.json / .cursor/mcp.json
                  </span>
                  <Button
                    variant="cyan"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(
                          {
                            mcpServers: {
                              atabey: {
                                command: "atabey",
                                args: ["mcp", "start"],
                              },
                            },
                          },
                          null,
                          2
                        ),
                        "mcp-json"
                      )
                    }
                    leftIcon={copied === "mcp-json" ? <Check size={12} /> : <Copy size={12} />}
                  >
                    <span>{copied === "mcp-json" ? "Copied" : "Copy JSON"}</span>
                  </Button>
                </div>
                <pre className="text-xs font-mono text-text-primary overflow-x-auto p-2 rounded bg-white/[0.02]">
{`{
  "mcpServers": {
    "atabey": {
      "command": "atabey",
      "args": ["mcp", "start"]
    }
  }
}`}
                </pre>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-secondary">
                    SSE Endpoint URL (Remote / Team mode)
                  </span>
                  <Button
                    variant="cyan"
                    size="sm"
                    onClick={() => copyToClipboard(s?.mcpSseUrl || "", "mcp-sse")}
                    leftIcon={copied === "mcp-sse" ? <Check size={12} /> : <Copy size={12} />}
                  >
                    <span>{copied === "mcp-sse" ? "Copied" : "Copy URL"}</span>
                  </Button>
                </div>
                <div className="font-mono text-xs text-brand-purple p-2 rounded bg-white/[0.02]">
                  {s?.mcpSseUrl || "http://localhost:5858/mcp/sse"}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
