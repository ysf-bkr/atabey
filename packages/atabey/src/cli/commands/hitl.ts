import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getFrameworkDir } from "../utils/memory.js";
import { UI } from "../utils/ui.js";
import { Storage } from "../../shared/storage.js";
import { approveCommand } from "./approve.js";

/**
 * Shows current Human-In-The-Loop pending requests (both ask_human questions and high-risk tool operations).
 */
export async function hitlStatusCommand(): Promise<void> {
    const frameworkDir = getFrameworkDir();
    const hitlDir = path.join(frameworkDir, "hitl");
    const questionFile = path.join(hitlDir, "question.txt");

    let foundSomething = false;

    // 1. Check for pending question from ask_human tool
    if (fs.existsSync(questionFile)) {
        try {
            const raw = fs.readFileSync(questionFile, "utf8");
            const data = JSON.parse(raw);
            foundSomething = true;
            process.stdout.write(`\n${chalk.bold.yellow("[HITL QUESTION PENDING]")}\n`);
            process.stdout.write(`  Question:  ${chalk.cyan(data.question)}\n`);
            process.stdout.write(`  Asked At:  ${chalk.gray(data.timestamp)}\n`);
            if (data.timeoutAt) {
                process.stdout.write(`  Timeout:   ${chalk.gray(data.timeoutAt)}\n`);
            }
            process.stdout.write(`\n  ${chalk.green('To answer, run: atabey hitl answer "<your answer>"')}\n\n`);
        } catch {
            // best-effort
        }
    }

    // 2. Check for pending approvals in SQLite
    const pendingApprovals = Storage.getPendingApprovals();
    if (pendingApprovals.length > 0) {
        foundSomething = true;
        process.stdout.write(`\n${chalk.bold.yellow(`[HITL OPERATION APPROVALS PENDING] (${pendingApprovals.length} request${pendingApprovals.length > 1 ? "s" : ""})`)}\n`);
        UI.divider();
        for (const req of pendingApprovals) {
            const riskBadge = req.riskScore >= 75
                ? chalk.bgRed.white.bold(` ${req.riskLevel} (${req.riskScore}) `)
                : chalk.bgYellow.black(` ${req.riskLevel} (${req.riskScore}) `);
            const displayAgent = req.agent.startsWith("@") ? req.agent : `@${req.agent}`;
            process.stdout.write(`Trace ID:  ${chalk.bold.cyan(req.traceId)} | Agent: ${chalk.green(displayAgent)} | Risk: ${riskBadge}\n`);
            process.stdout.write(`Tool:      ${chalk.bold(req.toolName)}\n`);
            process.stdout.write(`Reason:    ${chalk.white(req.reason)}\n`);
            process.stdout.write(`Created:   ${chalk.gray(new Date(req.createdAt).toLocaleString())}\n`);
            process.stdout.write(`Actions:   atabey hitl approve ${req.traceId} | atabey hitl reject ${req.traceId}\n`);
            UI.divider();
        }
    }

    if (!foundSomething) {
        UI.info("No pending HITL questions or approval requests. All clear.");
    }
}

/**
 * Responds to a pending ask_human question and/or unblocks a pending operation.
 */
export async function hitlAnswerCommand(answer: string, traceId?: string): Promise<void> {
    if (!answer || !answer.trim()) {
        UI.error('Answer cannot be empty. Usage: atabey hitl answer "your answer"');
        return;
    }

    const frameworkDir = getFrameworkDir();
    const hitlDir = path.join(frameworkDir, "hitl");
    const answerFile = path.join(hitlDir, "answer.txt");
    const questionFile = path.join(hitlDir, "question.txt");
    const pendingFile = path.join(hitlDir, "PENDING.txt");

    fs.mkdirSync(hitlDir, { recursive: true });

    // Write answer for ask_human tool file bridge
    fs.writeFileSync(answerFile, answer.trim());
    if (fs.existsSync(pendingFile)) {
        try { fs.unlinkSync(pendingFile); } catch { /* ignore */ }
    }
    if (fs.existsSync(questionFile)) {
        try { fs.unlinkSync(questionFile); } catch { /* ignore */ }
    }

    UI.success(`HITL answer written successfully: "${answer.trim()}"`);

    // If a traceId is provided, also approve the corresponding request
    if (traceId) {
        // approveCommand validates that a pending request actually exists and
        // throws otherwise — never report success for an unknown trace.
        await approveCommand(traceId);
        UI.success(`Approval granted for trace: ${traceId}`);
    } else {
        // If there is an active pending approval, approve it
        const pending = Storage.getPendingApprovals();
        if (pending.length === 1) {
            const req = pending[0];
            Storage.updateApprovalStatus(req.traceId, "APPROVED");
            await approveCommand(req.traceId).catch(() => {});
            UI.success(`Associated pending approval for trace ${req.traceId} approved.`);
        }
    }
}

/**
 * Approves a high-risk operation by trace ID.
 */
export async function hitlApproveCommand(traceId: string): Promise<void> {
    if (!traceId) {
        UI.error("Trace ID required. Usage: atabey hitl approve <traceId>");
        process.exit(64);
    }

    // approveCommand is the SSOT gate: it throws when no pending request exists.
    await approveCommand(traceId);

    // Also unblock ask_human file bridge if waiting
    const frameworkDir = getFrameworkDir();
    const hitlDir = path.join(frameworkDir, "hitl");
    const answerFile = path.join(hitlDir, "answer.txt");
    try {
        fs.mkdirSync(hitlDir, { recursive: true });
        fs.writeFileSync(answerFile, `Approved trace ${traceId}`);
    } catch { /* best effort */ }
}

/**
 * Rejects a high-risk operation by trace ID.
 */
export async function hitlRejectCommand(traceId: string, reason = "Rejected by operator"): Promise<void> {
    if (!traceId) {
        UI.error("Trace ID required. Usage: atabey hitl reject <traceId> [reason]");
        process.exit(64);
    }

    const approval = Storage.getApproval(traceId);
    if (!approval || approval.status !== "PENDING") {
        UI.error(`No pending approval request found for Trace ID: ${traceId}`);
        process.exit(1);
    }

    Storage.updateApprovalStatus(traceId, "REJECTED");

    // Also write rejection to file bridge
    const frameworkDir = getFrameworkDir();
    const hitlDir = path.join(frameworkDir, "hitl");
    const answerFile = path.join(hitlDir, "answer.txt");
    try {
        fs.mkdirSync(hitlDir, { recursive: true });
        fs.writeFileSync(answerFile, `Rejected: ${reason}`);
    } catch { /* best effort */ }

    UI.success(`Trace ${traceId} operation rejected. Reason: ${reason}`);
}
