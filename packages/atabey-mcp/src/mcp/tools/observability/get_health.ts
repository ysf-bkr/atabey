import os from "os";
import { ToolArgs, ToolResult } from "../types.js";

/**
 * Retrieves system health metrics including CPU load and memory usage.
 */
export function handleGetSystemHealth(_projectRoot: string, _args: ToolArgs): ToolResult {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

    const loadAvg = os.loadavg(); // [1, 5, 15] minute averages

    const healthReport = `[SERVER] **System Health Report**
- **Memory:** ${memUsagePercent}% used (${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB)
- **CPU Load (1m, 5m, 15m):** ${loadAvg.map(l => l.toFixed(2)).join(", ")}
- **Platform:** ${os.platform()} (${os.release()})
- **Uptime:** ${(os.uptime() / 3600).toFixed(2)} hours`;

    return {
        content: [{ type: "text", text: healthReport }]
    };
}
