import { spawnSync } from "child_process";
import { CheckActivePortsArgs, ToolResult } from "../types.js";

/**
 * Checks for active network ports and their status.
 * Uses spawnSync instead of execSync to prevent shell injection.
 */
export function handleCheckPorts(projectRoot: string, args: CheckActivePortsArgs): ToolResult {
    const rawFilter = args.filter || "";
    // Sanitize filter to prevent command injection (allow only alphanumeric, dots, colons, dashes, underscores)
    const filter = rawFilter.replace(/[^a-zA-Z0-9.:_-]/g, "");

    try {
        let output: string;

        if (process.platform === "win32") {
            const result = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
            if (result.error) throw result.error;
            const lines = (result.stdout || "").split("\n").filter(l => l.includes("LISTENING"));
            output = filter
                ? lines.filter(l => l.includes(filter)).join("\n")
                : lines.join("\n");
        } else {
            const result = spawnSync("lsof", ["-i", "-P", "-n"], { encoding: "utf8" });
            if (result.error) throw result.error;
            const lines = (result.stdout || "").split("\n").filter(l => l.includes("LISTEN"));
            output = filter
                ? lines.filter(l => l.includes(filter)).join("\n")
                : lines.join("\n");
        }

        return {
            content: [{
                type: "text",
                text: `[SIGNAL] **Active Listening Ports:**\n\n${output || "No active listening ports found matching filter."}`
            }]
        };
    } catch (_e) {
        return {
            content: [{ type: "text", text: "[INFO] No active ports found or command failed (this is normal if nothing is listening)." }]
        };
    }
}
