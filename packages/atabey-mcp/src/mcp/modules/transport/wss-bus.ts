import { createServer, type Server } from "http";
import type { Server as HttpsServer } from "https";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "atabey-shared/logger.js";

export interface BusFrame {
    type: string;
    [key: string]: unknown;
}

export interface BusOptions {
    /** Attach to an existing HTTP(S) server (production) — else a standalone one is spun up. */
    server?: Server | HttpsServer;
    /** URL path for the hub (default "/" for standalone; use "/bus" when attached). */
    path?: string;
    /** Port for a standalone server (0 = ephemeral, for tests). */
    port?: number;
    /** Shared secret; when set, `hello` must carry a matching token. */
    token?: string | null;
    /** Lock stale-timeout in ms. */
    lockTimeoutMs?: number;
}

interface LockEntry {
    owner: string;
    expiresAt: number;
}

/**
 * ─── HERMES WSS BUS ──────────────────────────────────────────────────
 *
 * A single WebSocket hub that provides message routing + server-authoritative
 * distributed locks for multi-agent / multi-machine coordination. Reuses the
 * existing `ws` dependency — **no Redis/NATS**.
 *
 * Frames: hello · delegate · result · ack · heartbeat · lock.req/grant/denied/release.
 */
export class HermesBus {
    private readonly wss: WebSocketServer;
    private readonly httpServer: Server | null;
    private readonly ownsServer: boolean;
    private readonly lockTimeoutMs: number;
    private readonly token: string | null;
    private readonly clients = new Map<string, WebSocket>();
    private readonly locks = new Map<string, LockEntry>();
    private readonly backlog = new Map<string, BusFrame[]>();
    private seq = 0;
    private sweeper: ReturnType<typeof setInterval> | null = null;
    /** Resolves once a standalone server is listening (no-op when attached). */
    public readonly ready: Promise<void>;

    constructor(options: BusOptions = {}) {
        this.lockTimeoutMs = options.lockTimeoutMs ?? 30_000;
        this.token = options.token ?? process.env.ATABEY_BUS_TOKEN ?? null;

        if (options.server) {
            this.wss = new WebSocketServer({ server: options.server, path: options.path });
            this.httpServer = null;
            this.ownsServer = false;
            this.ready = Promise.resolve();
        } else {
            const server = createServer();
            this.wss = new WebSocketServer({ server });
            this.httpServer = server;
            this.ownsServer = true;
            this.ready = new Promise<void>((resolve) => server.once("listening", () => resolve()));
            server.listen(options.port ?? 0);
        }

        this.wss.on("connection", (ws) => this.onConnection(ws));
        this.sweeper = setInterval(() => this.sweepLocks(), Math.min(this.lockTimeoutMs, 5_000));
        if (this.sweeper.unref) this.sweeper.unref();
    }

    /** Ephemeral port when running standalone (0 otherwise). */
    public get port(): number {
        if (!this.httpServer) return 0;
        const addr = this.httpServer.address();
        return addr && typeof addr === "object" ? addr.port : 0;
    }

    public isOnline(agent: string): boolean {
        const ws = this.clients.get(agent);
        return !!ws && ws.readyState === WebSocket.OPEN;
    }

    public getBacklogSize(agent: string): number {
        return (this.backlog.get(agent) || []).length;
    }

    public getStats(): { online: string[]; locks: Array<{ resource: string; owner: string }>; queuedMessages: number } {
        let queuedMessages = 0;
        for (const q of this.backlog.values()) queuedMessages += q.length;
        return {
            online: [...this.clients.keys()],
            locks: [...this.locks.entries()].map(([resource, l]) => ({ resource, owner: l.owner })),
            queuedMessages,
        };
    }

    /** Server-authoritative lock acquisition. */
    public acquireLock(agent: string, resource: string): { granted: boolean; owner: string } {
        const now = Date.now();
        const current = this.locks.get(resource);
        if (current && current.expiresAt > now && current.owner !== agent) {
            return { granted: false, owner: current.owner };
        }
        this.locks.set(resource, { owner: agent, expiresAt: now + this.lockTimeoutMs });
        return { granted: true, owner: agent };
    }

    public releaseLock(agent: string, resource: string): boolean {
        const current = this.locks.get(resource);
        if (!current || current.owner !== agent) return false;
        this.locks.delete(resource);
        return true;
    }

    public async close(): Promise<void> {
        if (this.sweeper) clearInterval(this.sweeper);
        for (const ws of this.clients.values()) {
            try {
                ws.close();
            } catch (err) {
                logger.debug("Hermes WSS bus operation failed (non-fatal)", err);
            }
        }
        await new Promise<void>((resolve) => this.wss.close(() => resolve()));
        if (this.ownsServer && this.httpServer) this.httpServer.close();
    }

    // ─── internals ────────────────────────────────────────────────────

    private onConnection(ws: WebSocket): void {
        let agent: string | null = null;

        ws.on("message", (data) => {
            let frame: BusFrame;
            try {
                frame = JSON.parse(data.toString()) as BusFrame;
            } catch {
                return;
            }

            if (frame.type === "hello") {
                const provided = typeof frame.token === "string" ? frame.token : null;
                if (this.token && provided !== this.token) {
                    ws.send(JSON.stringify({ type: "error", reason: "unauthorized" }));
                    ws.close();
                    return;
                }
                agent = typeof frame.agent === "string" ? frame.agent : "unknown";
                this.clients.set(agent, ws);
                ws.send(JSON.stringify({ type: "hello.ok", agent }));

                // Replay any unacknowledged backlog frames queued while agent was offline
                const pending = this.backlog.get(agent);
                if (pending && pending.length > 0) {
                    for (const queued of pending) {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ ...queued, replayed: true }));
                        }
                    }
                }
                return;
            }

            if (!agent) return;
            this.handleFrame(agent, ws, frame);
        });

        const cleanupClient = () => {
            if (agent && this.clients.get(agent) === ws) {
                this.clients.delete(agent);
                for (const [res, entry] of this.locks) {
                    if (entry.owner === agent) {
                        this.locks.delete(res);
                    }
                }
            }
        };
        ws.on("close", cleanupClient);
        ws.on("error", cleanupClient);
    }

    private handleFrame(agent: string, ws: WebSocket, frame: BusFrame): void {
        switch (frame.type) {
            case "heartbeat":
                ws.send(JSON.stringify({ type: "heartbeat.ok", at: Date.now() }));
                break;
            case "delegate": {
                if (typeof frame.to === "string") {
                    this.sendOrQueue(frame.to, { ...frame, type: "delegate", from: agent });
                }
                break;
            }
            case "result": {
                const target = typeof frame.to === "string" ? frame.to : null;
                if (target) this.sendOrQueue(target, { ...frame, type: "result", from: agent });
                else this.broadcast({ ...frame, type: "result", from: agent });
                break;
            }
            case "lock.req": {
                const resource = String(frame.resource);
                const result = this.acquireLock(agent, resource);
                ws.send(
                    JSON.stringify({
                        type: result.granted ? "lock.grant" : "lock.denied",
                        resource,
                        owner: result.owner,
                    }),
                );
                break;
            }
            case "lock.release": {
                const resource = String(frame.resource);
                ws.send(JSON.stringify({ type: "lock.released", resource, ok: this.releaseLock(agent, resource) }));
                break;
            }
            case "ack": {
                const ackId = typeof frame.id === "string" ? frame.id : null;
                const queue = this.backlog.get(agent);
                if (queue) {
                    if (ackId) {
                        const filtered = queue.filter((f) => f.id !== ackId);
                        if (filtered.length > 0) this.backlog.set(agent, filtered);
                        else this.backlog.delete(agent);
                    } else {
                        this.backlog.delete(agent);
                    }
                }
                ws.send(JSON.stringify({ type: "ack.ok", id: ackId }));
                break;
            }
            default:
                break;
        }
    }

    private sendOrQueue(to: string, frame: BusFrame): boolean {
        const msgId = typeof frame.id === "string" ? frame.id : `msg-${++this.seq}-${Date.now()}`;
        const stamped: BusFrame = { ...frame, id: msgId };
        const ws = this.clients.get(to);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(stamped));
            return true;
        }
        const queue = this.backlog.get(to) || [];
        if (queue.length >= 500) queue.shift();
        queue.push(stamped);
        this.backlog.set(to, queue);
        return false;
    }

    private broadcast(frame: BusFrame): void {
        const msg = JSON.stringify(frame);
        for (const ws of this.clients.values()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
    }

    private sweepLocks(): void {
        const now = Date.now();
        for (const [resource, entry] of this.locks) {
            if (entry.expiresAt <= now) {
                this.locks.delete(resource);
                logger.debug(`[BUS] lock expired: ${resource} (was ${entry.owner})`);
            }
        }
    }
}
