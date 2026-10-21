import { execFileSync } from "node:child_process";

/**
 * Network-isolated sandboxes (CI containers, seatbelt profiles) can deny
 * `connect()` or `listen()` on loopback with EPERM. Integration suites that need a real
 * loopback socket should skip there instead of failing the whole test run.
 *
 * Set ATABEY_DISABLE_LOOPBACK=1 to force the skip (useful for testing this
 * guard), or ATABEY_FORCE_LOOPBACK_TESTS=true to force the suites to run.
 */
export function supportsLoopback(): boolean {
    if (process.env.ATABEY_FORCE_LOOPBACK_TESTS === "true") return true;
    if (process.env.ATABEY_DISABLE_LOOPBACK === "1") return false;

    const probe = `
        const net = require("node:net");
        const server = net.createServer();
        server.once("error", () => process.exit(1));
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            const client = net.connect(port, "127.0.0.1");
            client.once("connect", () => { client.end(); server.close(() => process.exit(0)); });
            client.once("error", () => { server.close(() => process.exit(1)); });
        });
    `;
    try {
        execFileSync(process.execPath, ["-e", probe], { timeout: 3000, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}
