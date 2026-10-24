/**
 * Orchestrates what happens when a CLI command fails.
 *
 * Sequence (never reordered):
 *   1. write the redacted report locally
 *   2. print a short, actionable message with the report id
 *   3. if telemetry is enabled AND the terminal is interactive, ask before upload
 *   4. if upload fails, keep the local file and print a manual link
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import {
    buildErrorReport,
    formatReport,
    manualReportUrl,
    resolveTelemetry,
    submitErrorReport,
    writeErrorReport,
    type ErrorReport,
    type ReportStage,
} from "./diagnostics.js";
import { getPackageVersion } from "./pkg.js";
import { UI } from "./ui.js";

export interface FailureContext {
    command: string;
    stage?: ReportStage;
    error: unknown;
}

/** Terminal check for the consent prompt: CI and pipes must never be asked. */
function canPrompt(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;
}

async function askYesNo(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
        return /^(y|yes|e|evet)$/i.test(answer.trim());
    } finally {
        rl.close();
    }
}

function shortError(report: ErrorReport): string {
    const code = report.errorCode ? ` ${report.errorCode}` : "";
    return `${report.errorName}${code}: ${report.message.split("\n")[0]}`;
}

/**
 * Prints the manual reporting route without flooding the terminal: a short link
 * is shown inline, a long one is saved next to the report as `<id>.url` and only
 * its path is printed.
 */
function showManualLink(report: ErrorReport, url: string, projectRoot: string): void {
    if (url.length <= 220) {
        process.stdout.write(`  ${url}\n`);
        return;
    }
    const dir = path.join(projectRoot, ".atabey", "logs", "error-reports");
    const file = path.join(dir, `${report.id}.url`);
    try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, url + "\n", { encoding: "utf8", mode: 0o600 });
        UI.info(`Prefilled report link saved: ${path.relative(projectRoot, file)}`);
        UI.info(`(Open that file, or run \`atabey report --show ${report.id}\` and paste the output.)`);
    } catch {
        process.stdout.write(`  ${url}\n`);
    }
}

/**
 * Records a failure and prints the user-facing guidance. Returns the report so
 * callers (and tests) can assert on it.
 */
export async function handleCommandFailure(ctx: FailureContext): Promise<ErrorReport> {
    const projectRoot = process.cwd();
    const report = buildErrorReport({
        command: ctx.command,
        stage: ctx.stage,
        error: ctx.error,
        projectRoot,
        atabeyVersion: getPackageVersion(),
    });

    let reportPath: string | null = null;
    try {
        reportPath = writeErrorReport(report, projectRoot);
    } catch (writeErr) {
        // Never hide the original failure behind a logging failure.
        UI.warning(`Could not write the local error report: ${(writeErr as Error).message}`);
    }

    UI.error(`Atabey ${report.command} failed (stage: ${report.stage}, report: ${report.id}).`);
    UI.info(`Cause: ${shortError(report)}`);
    if (reportPath) {
        UI.info(`Details: ${path.relative(projectRoot, reportPath)}`);
    }

    const telemetry = resolveTelemetry(projectRoot);
    const url = manualReportUrl(report, telemetry.repo);

    if (!telemetry.enabled) {
        UI.info("Sharing is off by default. Nothing was uploaded.");
        UI.info(`To inspect it: \`atabey report --show ${report.id}\`. To report it yourself:`);
        showManualLink(report, url, projectRoot);
        UI.info("To enable prompted uploads: `ATABEY_TELEMETRY=1` (see docs/telemetry.md).");
        return report;
    }

    // Telemetry is enabled — still ask, because the user enabled the capability,
    // not a blanket "send everything silently" policy.
    let consent = false;
    if (canPrompt()) {
        consent = await askYesNo("Send this redacted report to the Atabey maintainers? [y/N] ");
    } else {
        UI.info("Non-interactive session, so nothing was uploaded automatically.");
    }

    if (!consent) {
        UI.info("Report kept locally.");
        showManualLink(report, url, projectRoot);
        return report;
    }

    const result = await submitErrorReport(report, telemetry, { useGh: true });
    if (result.submitted) {
        UI.success(`Report ${report.id} sent${result.url ? `: ${result.url}` : "."} The local copy is kept.`);
        return report;
    }

    // Upload failed: the local file is the source of truth, plus a manual route.
    UI.warning(`Could not upload the report: ${result.error ?? "unknown error"}`);
    UI.info("Your local report was kept. You can submit it from here:");
    showManualLink(report, url, projectRoot);
    return report;
}

/** Prints a stored report (used by `atabey report --show <id>`). */
export function printReport(report: ErrorReport): void {
    process.stdout.write(formatReport(report) + "\n");
}

/** Re-submits an already stored report; used by `atabey report --send <id>`. */
export async function resendReport(report: ErrorReport, projectRoot = process.cwd()): Promise<boolean> {
    const telemetry = resolveTelemetry(projectRoot);
    if (!telemetry.enabled) {
        // Respect the switch: an explicit `--send` is still gated on the setting
        // so that "off" really means off.
        UI.error("Sharing is disabled. Set ATABEY_TELEMETRY=1 (or telemetry.enabled in .atabey/config.json) first.");
        return false;
    }
    const result = await submitErrorReport(report, telemetry, { useGh: true });
    if (result.submitted) {
        UI.success(`Report ${report.id} sent${result.url ? `: ${result.url}` : "."}`);
        return true;
    }
    UI.warning(`Upload failed: ${result.error ?? "unknown error"}`);
    showManualLink(report, manualReportUrl(report, telemetry.repo), projectRoot);
    return false;
}
