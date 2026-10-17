import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Button, EmptyState } from "./ui";

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
  const { t } = useI18n();
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

  const isConnected = Boolean(status?.serverUrl && status.serverUrl.length > 0);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("nav.telemetry")}
        description={t("page.settings.desc")}
        icon={<Wifi className="w-5 h-5 text-cyan-400" />}
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
        {loading && !status ? (
          <EmptyState
            icon={<Wifi className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("common.loading")}
          />
        ) : error && !status ? (
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
                <span
                  className={`block text-xl font-bold font-mono ${
                    status?.enabled ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {status?.enabled ? t("common.status") + ": Active" : "Disabled"}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("stat.policy_gate_status")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span
                  className={`block text-xl font-bold font-mono ${
                    isConnected ? "text-emerald-400" : "text-text-muted"
                  }`}
                >
                  {isConnected ? t("nav.connected") : t("nav.disconnected")}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Server Link
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-cyan-400">
                  {status?.queueSize || 0}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Queue Depth
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <span className="block text-xl font-bold font-mono text-brand-purple">
                  {status?.eventsThisMinute || 0}/min
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Event Rate
                </span>
              </div>
            </div>

            {/* Stream Config Grid */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                Stream Configuration
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-text-muted text-[11px] block">Server URL</span>
                  <span className="font-mono text-cyan-400 truncate block">
                    {status?.serverUrl || "Not configured"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-text-muted text-[11px] block">Batch Size</span>
                  <span className="font-mono text-text-primary">
                    {status?.config?.BATCH_SIZE ?? 50} events
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-text-muted text-[11px] block">Flush Interval</span>
                  <span className="font-mono text-text-primary">
                    {status?.config?.FLUSH_INTERVAL_MS ?? 5000} ms
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
