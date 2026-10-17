import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { HermesBus, type BusFrame } from "../../../src/mcp/utils/wss-bus.js";

let bus: HermesBus | null = null;

function connect(port: number, agent: string, token?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.on("open", () => ws.send(JSON.stringify({ type: "hello", agent, token })));
        ws.on("message", (data) => {
            const frame = JSON.parse(data.toString()) as BusFrame;
            if (frame.type === "hello.ok") resolve(ws);
            else if (frame.type === "error") reject(new Error(String(frame.reason)));
        });
        ws.on("error", reject);
    });
}

function nextFrame(ws: WebSocket): Promise<BusFrame> {
    return new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()) as BusFrame)));
}

afterEach(async () => {
    if (bus) await bus.close();
    bus = null;
});

describe("HermesBus", () => {
    it("authenticates with a shared token and rejects the wrong one", async () => {
        bus = new HermesBus({ port: 0, token: "secret" });
        await bus.ready;

        const good = await connect(bus.port, "@a", "secret");
        expect(bus.isOnline("@a")).toBe(true);
        good.close();

        await expect(connect(bus.port, "@b", "wrong")).rejects.toThrow(/unauthorized/);
    });

    it("routes delegate frames between agents", async () => {
        bus = new HermesBus({ port: 0 });
        await bus.ready;
        const a = await connect(bus.port, "@a");
        const b = await connect(bus.port, "@b");

        const received = nextFrame(b);
        a.send(JSON.stringify({ type: "delegate", to: "@b", task: "build" }));

        const frame = await received;
        expect(frame.type).toBe("delegate");
        expect(frame.from).toBe("@a");
        expect(frame.task).toBe("build");

        a.close();
        b.close();
    });

    it("enforces a server-authoritative distributed lock", async () => {
        bus = new HermesBus({ port: 0 });
        await bus.ready;
        const a = await connect(bus.port, "@a");
        const b = await connect(bus.port, "@b");

        let wait = nextFrame(a);
        a.send(JSON.stringify({ type: "lock.req", resource: "file.ts" }));
        expect((await wait).type).toBe("lock.grant");

        wait = nextFrame(b);
        b.send(JSON.stringify({ type: "lock.req", resource: "file.ts" }));
        const denied = await wait;
        expect(denied.type).toBe("lock.denied");
        expect(denied.owner).toBe("@a");

        wait = nextFrame(a);
        a.send(JSON.stringify({ type: "lock.release", resource: "file.ts" }));
        expect((await wait).ok).toBe(true);

        wait = nextFrame(b);
        b.send(JSON.stringify({ type: "lock.req", resource: "file.ts" }));
        expect((await wait).type).toBe("lock.grant");

        a.close();
        b.close();
    });

    it("answers heartbeats", async () => {
        bus = new HermesBus({ port: 0 });
        await bus.ready;
        const a = await connect(bus.port, "@a");
        const wait = nextFrame(a);
        a.send(JSON.stringify({ type: "heartbeat" }));
        expect((await wait).type).toBe("heartbeat.ok");
        a.close();
    });
});
