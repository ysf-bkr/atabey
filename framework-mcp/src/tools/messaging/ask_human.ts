import fs from "fs";
import path from "path";
import { ToolResult } from "../types.js";

interface AskHumanArgs {
    question: string;
    timeoutSeconds?: number;
}

/**
 * ─── ASK HUMAN — File Bridge ─────────────────────────────────────────
 *
 * AI CLI'lar (Claude Code, Gemini CLI) MCP server'ı stdio subprocess olarak
 * başlatır. Bu subprocess'te stdin isTTY=false olur (MCP JSON-RPC için kullanılır).
 *
 * Çözüm: File-based Q&A bridge.
 * 1. Soru → .atabey/hitl/question.txt dosyasına yazılır
 * 2. Geliştirici `atabey hitl` komutuyla cevap girer
 * 3. Cevap → .atabey/hitl/answer.txt dosyasına yazılır
 * 4. Bu handler cevabı okur ve AI'ya döner
 *
 * Dashboard: /api/approvals endpoint'i üzerinden web dashboard'dan da cevaplanabilir.
 */
export async function handleAskHuman(root: string, args: AskHumanArgs): Promise<ToolResult> {
    const timeoutSeconds = args.timeoutSeconds ?? 120;
    const hitlDir = path.join(root, ".atabey", "hitl");
    const questionFile = path.join(hitlDir, "question.txt");
    const answerFile = path.join(hitlDir, "answer.txt");

    try {
        // Ensure hitl directory exists
        fs.mkdirSync(hitlDir, { recursive: true });

        // Clear any stale answer file
        if (fs.existsSync(answerFile)) {
            fs.unlinkSync(answerFile);
        }

        // Write the question with metadata
        const questionPayload = JSON.stringify({
            timestamp: new Date().toISOString(),
            question: args.question,
            timeoutAt: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
        }, null, 2);

        fs.writeFileSync(questionFile, questionPayload);

        // Write human-readable prompt file alongside
        fs.writeFileSync(
            path.join(hitlDir, "PENDING.txt"),
            [
                "═══════════════════════════════════════════════════",
                " [ATABEY] AGENT WAITING FOR YOUR ANSWER",
                "═══════════════════════════════════════════════════",
                "",
                `QUESTION: ${args.question}`,
                "",
                "To answer, run in your terminal:",
                "  atabey hitl answer \"your answer here\"",
                "",
                "Or use the dashboard: http://localhost:5858",
                "═══════════════════════════════════════════════════",
            ].join("\n")
        );

        process.stderr.write(`[HITL] Question written to ${questionFile}\n`);
        process.stderr.write("[HITL] Run: atabey hitl answer \"your answer\"\n");

        // Poll for answer file
        const pollIntervalMs = 1000;
        const maxAttempts = timeoutSeconds;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

            if (fs.existsSync(answerFile)) {
                const answer = fs.readFileSync(answerFile, "utf8").trim();

                // Clean up
                try {
                    fs.unlinkSync(questionFile);
                    fs.unlinkSync(answerFile);
                    const pendingFile = path.join(hitlDir, "PENDING.txt");
                    if (fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile);
                } catch { /* cleanup is best-effort */ }

                process.stderr.write("[HITL] Answer received.\n");
                return {
                    content: [{ type: "text", text: `[HUMAN RESPONSE] ${answer}` }],
                };
            }
        }

        // Timeout — clean up question file
        try {
            if (fs.existsSync(questionFile)) fs.unlinkSync(questionFile);
            const pendingFile = path.join(hitlDir, "PENDING.txt");
            if (fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile);
        } catch { /* cleanup is best-effort */ }

        return {
            content: [{
                type: "text",
                text: `[HITL TIMEOUT] No answer received within ${timeoutSeconds}s.\n` +
                    `Question was: "${args.question}"\n` +
                    "To answer pending questions, run: atabey hitl answer \"your answer\"",
            }],
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] ask_human failed: ${message}` }],
        };
    }
}

