import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { AgentAdapter, AgentTurnRequest, AgentTurnResult } from "./types.js";

export interface CliPreset {
    /** Command to spawn (resolved on PATH or an absolute path). */
    command: string;
    /** Build argv from the composed prompt. */
    buildArgs: (prompt: string) => string[];
    /** Optional: pass the prompt via stdin instead of argv. */
    useStdin?: boolean;
}

/**
 * Built-in headless CLI presets — all non-interactive ("print" mode).
 * Overridable per project via `.atabey/config.json` (`runtime.cli`) or by
 * passing a custom `CliPreset` to the constructor.
 */
export const CLI_PRESETS: Record<string, CliPreset> = {
    claude: { command: "claude", buildArgs: (p) => ["-p", p, "--output-format", "text"] },
    gemini: { command: "gemini", buildArgs: (p) => ["-p", p] },
    codex: { command: "codex", buildArgs: (p) => ["exec", p] },
    aider: { command: "aider", buildArgs: (p) => ["--yes", "--no-auto-commits", "--message", p] },
    ollama: {
        command: "ollama",
        buildArgs: (p) => ["run", process.env.ATABEY_OLLAMA_MODEL || "llama3", p],
    },
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_CHARS = 200_000;

/**
 * Drives a single headless CLI invocation as one agent "turn".
 *
 * Safety: `shell: false` (no shell interpolation), hard timeout with SIGKILL,
 * output capping, and never-throws result contract.
 */
export class HeadlessCliAdapter implements AgentAdapter {
    public readonly id: string;
    private readonly preset: CliPreset;

    constructor(cliId: string, preset?: CliPreset) {
        this.id = cliId;
        const resolved = preset ?? CLI_PRESETS[cliId];
        if (!resolved) throw new Error(`Unknown CLI adapter: ${cliId}`);
        this.preset = resolved;
    }

    /** Resolve the command on PATH (or as an absolute path). */
    public async isAvailable(): Promise<boolean> {
        const { command } = this.preset;
        if (path.isAbsolute(command)) return fs.existsSync(command);
        const pathEnv = process.env.PATH || "";
        const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
        return pathEnv.split(path.delimiter).some((dir) =>
            exts.some((ext) => dir && fs.existsSync(path.join(dir, command + ext))),
        );
    }

    /** Expose the resolved command + argv (used by the sandbox runtime). */
    public buildCommand(prompt: string): { command: string; args: string[]; useStdin?: boolean } {
        return { command: this.preset.command, args: this.preset.buildArgs(prompt), useStdin: this.preset.useStdin };
    }

    public runTurn(req: AgentTurnRequest): Promise<AgentTurnResult> {
        const started = Date.now();
        const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const maxChars = req.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

        const composed = req.systemPrompt ? `${req.systemPrompt}\n\n${req.prompt}` : req.prompt;
        const args = this.preset.buildArgs(composed);

        return new Promise<AgentTurnResult>((resolve) => {
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            let settled = false;

            const child = spawn(this.preset.command, args, {
                cwd: req.cwd,
                env: { ...process.env, ...(req.env || {}) },
                stdio: [this.preset.useStdin ? "pipe" : "ignore", "pipe", "pipe"],
                shell: false,
            });

            const timer = setTimeout(() => {
                timedOut = true;
                try {
                    child.kill("SIGKILL");
                } catch {
                    /* already dead */
                }
            }, timeoutMs);

            const finish = (exitCode: number | null, error?: string): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                let output = stdout.trim();
                if (output.length > maxChars) {
                    output = output.slice(0, maxChars) + `\n[... truncated ${stdout.length - maxChars} chars]`;
                }

                const ok = !timedOut && exitCode === 0;
                let reason = error;
                if (!ok && !reason) {
                    reason = timedOut
                        ? `Timeout after ${timeoutMs}ms`
                        : stderr.trim().slice(0, 2000) || `Process exited with code ${exitCode}`;
                }

                resolve({
                    ok,
                    output,
                    exitCode,
                    durationMs: Date.now() - started,
                    timedOut,
                    adapterId: this.id,
                    error: ok ? undefined : reason,
                });
            };

            child.stdout?.on("data", (d: Buffer) => {
                stdout += d.toString();
            });
            child.stderr?.on("data", (d: Buffer) => {
                stderr += d.toString();
            });
            child.on("error", (err: Error) => finish(null, `spawn failed: ${err.message}`));
            child.on("close", (code: number | null) => finish(code));

            if (this.preset.useStdin && child.stdin) {
                child.stdin.write(composed);
                child.stdin.end();
            }
        });
    }
}
