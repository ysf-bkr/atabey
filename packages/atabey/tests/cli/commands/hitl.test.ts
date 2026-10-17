import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    hitlAnswerCommand,
    hitlApproveCommand,
    hitlRejectCommand,
    hitlStatusCommand,
} from "../../../src/cli/commands/hitl.js";
import { getFrameworkDir } from "../../../src/cli/utils/memory.js";
import { Storage } from "../../../src/shared/storage.js";

describe("CLI hitl commands", () => {
    const frameworkDir = getFrameworkDir();
    const hitlDir = path.join(frameworkDir, "hitl");

    beforeEach(() => {
        fs.mkdirSync(hitlDir, { recursive: true });
        // Clean any leftover files
        const files = ["question.txt", "answer.txt", "PENDING.txt"];
        for (const f of files) {
            const p = path.join(hitlDir, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
    });

    afterEach(() => {
        const files = ["question.txt", "answer.txt", "PENDING.txt"];
        for (const f of files) {
            const p = path.join(hitlDir, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        vi.restoreAllMocks();
    });

    it("hitlStatusCommand runs cleanly when no requests are pending", async () => {
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await hitlStatusCommand();
        expect(stdoutSpy).toHaveBeenCalled();
    });

    it("hitlStatusCommand displays pending question if question.txt exists", async () => {
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const questionPayload = JSON.stringify({
            timestamp: new Date().toISOString(),
            question: "Is this production deployment authorized?",
            timeoutAt: new Date(Date.now() + 60000).toISOString(),
        });
        fs.writeFileSync(path.join(hitlDir, "question.txt"), questionPayload);

        await hitlStatusCommand();
        const output = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
        expect(output).toContain("HITL QUESTION PENDING");
        expect(output).toContain("Is this production deployment authorized?");
    });

    it("hitlStatusCommand displays pending approvals from SQLite", async () => {
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const traceId = `T-TEST-${Date.now()}`;
        Storage.saveApprovalRequest({
            traceId,
            toolName: "delete_knowledge",
            agent: "manager",
            riskScore: 85,
            riskLevel: "CRITICAL",
            reason: "Drop production collection",
            args: { id: "all" },
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
        });

        await hitlStatusCommand();
        const output = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
        expect(output).toContain("HITL OPERATION APPROVALS PENDING");
        expect(output).toContain(traceId);
        expect(output).toContain("delete_knowledge");
    });

    it("hitlAnswerCommand writes answer.txt and cleans PENDING.txt", async () => {
        const pendingFile = path.join(hitlDir, "PENDING.txt");
        const answerFile = path.join(hitlDir, "answer.txt");
        fs.writeFileSync(pendingFile, "waiting...");

        await hitlAnswerCommand("Yes, approved by lead architect");

        expect(fs.existsSync(answerFile)).toBe(true);
        expect(fs.readFileSync(answerFile, "utf8")).toBe("Yes, approved by lead architect");
        expect(fs.existsSync(pendingFile)).toBe(false);
    });

    it("hitlApproveCommand updates SQLite approval status to APPROVED", async () => {
        const traceId = `T-APP-${Date.now()}`;
        Storage.saveApprovalRequest({
            traceId,
            toolName: "run_shell_command",
            agent: "backend",
            riskScore: 90,
            riskLevel: "CRITICAL",
            reason: "Apply database migration",
            args: { command: "npm run migrate" },
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
        });

        await hitlApproveCommand(traceId);

        const approval = Storage.getApproval(traceId);
        expect(approval).not.toBeNull();
        expect(approval?.status).toBe("APPROVED");
    });

    it("hitlRejectCommand updates SQLite approval status to REJECTED", async () => {
        const traceId = `T-REJ-${Date.now()}`;
        Storage.saveApprovalRequest({
            traceId,
            toolName: "run_shell_command",
            agent: "backend",
            riskScore: 90,
            riskLevel: "CRITICAL",
            reason: "Delete build cache",
            args: { command: "rm -rf cache" },
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
        });

        await hitlRejectCommand(traceId, "Unsafe operation");

        const approval = Storage.getApproval(traceId);
        expect(approval).not.toBeNull();
        expect(approval?.status).toBe("REJECTED");
    });
});
