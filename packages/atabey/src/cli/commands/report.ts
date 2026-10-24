import { readErrorReport, listErrorReports, resolveTelemetry, reportsDir } from "../utils/diagnostics.js";
import { printReport, resendReport } from "../utils/error-reporting.js";
import { UI } from "../utils/ui.js";

/**
 * `atabey report` — inspect and (optionally) send stored error reports.
 *
 *   atabey report                 list local reports
 *   atabey report --show <id>     print one report (redacted)
 *   atabey report --send <id>     upload one (requires telemetry enabled)
 *   atabey report --status        show whether sharing is on
 *
 * Nothing is uploaded without `--send` plus telemetry being enabled.
 */
export async function reportCommand(args: string[]): Promise<void> {
    const projectRoot = process.cwd();
    const flag = (name: string): string | undefined => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };

    if (args.includes("--status")) {
        const telemetry = resolveTelemetry(projectRoot);
        UI.info(`Sharing: ${telemetry.enabled ? "ENABLED" : "disabled (default)"}`);
        if (telemetry.endpoint) UI.info(`Endpoint: ${telemetry.endpoint}`);
        if (telemetry.repo) UI.info(`GitHub issue repo: ${telemetry.repo}`);
        UI.info(`Local reports directory: ${reportsDir(projectRoot)}`);
        if (!telemetry.enabled) {
            UI.info("Enable with ATABEY_TELEMETRY=1, or \".atabey/config.json\" → {\"telemetry\":{\"enabled\":true}}");
        }
        return;
    }

    const showId = flag("--show");
    if (showId) {
        const report = readErrorReport(showId, projectRoot);
        if (!report) {
            UI.error(`No local report with id "${showId}".`);
            process.exitCode = 1;
            return;
        }
        printReport(report);
        return;
    }

    const sendId = flag("--send");
    if (sendId) {
        const report = readErrorReport(sendId, projectRoot);
        if (!report) {
            UI.error(`No local report with id "${sendId}".`);
            process.exitCode = 1;
            return;
        }
        const ok = await resendReport(report, projectRoot);
        if (!ok) process.exitCode = 1;
        return;
    }

    const files = listErrorReports(projectRoot);
    if (files.length === 0) {
        UI.info("No error reports stored locally.");
        return;
    }
    UI.info(`${files.length} local report(s) in ${reportsDir(projectRoot)}:`);
    for (const file of files) {
        process.stdout.write(`  ${file.replace(/\.json$/, "")}\n`);
    }
    UI.info("Inspect: `atabey report --show <id>`   Send: `atabey report --send <id>`");
}
