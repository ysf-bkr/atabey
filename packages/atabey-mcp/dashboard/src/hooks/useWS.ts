import { useEffect, useRef, useState } from "react";

interface WSOptions {
    handlers?: Record<string, (data: Record<string, unknown>) => void>;
    port?: number;
}

export function useWS({ handlers = {}, port }: WSOptions = {}) {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        let attempts = 0;

        function connect() {
            wsRef.current?.close();
            const currentPort = location.port;
            // Use provided port, or current page port, or default 5858
            const wsPort = port || currentPort || "5858";
            // Match page security: https → wss, http → ws.
            const proto = location.protocol === "https:" ? "wss" : "ws";
            let token = "";
            try { token = localStorage.getItem("atabey_token") || ""; } catch { /* ignore */ }
            const qs = token ? `?token=${encodeURIComponent(token)}` : "";
            const ws = new WebSocket(`${proto}://${location.hostname}:${wsPort}/ws${qs}`);
            wsRef.current = ws;

            ws.onopen = () => { setConnected(true); attempts = 0; };
            ws.onclose = () => {
                setConnected(false);
                if (attempts < 10) {
                    attempts++;
                    timer = setTimeout(connect, 3000 * Math.min(attempts, 5));
                }
            };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "pong") return;
                    const h = handlers[msg.type];
                    if (h) h(msg.payload || {});
                } catch { /* ignore */ }
            };
        }

        connect();
        return () => { clearTimeout(timer); wsRef.current?.close(); };
    }, []);

    return connected;
}
