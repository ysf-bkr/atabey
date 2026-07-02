/**
 * ─── AUTO-ROLLBACK + REGENERATE ───────────────────────────────────
 *
 * When the AI generates code that violates governance rules (e.g., `any` type,
 * console.log, copyleft license), this module:
 *   1. Captures the file content before the write
 *   2. Validates the new content against governance rules
 *   3. If violation found: blocks the write, restores original, and sends
 *      a regenerate instruction back to the AI via MCP notification
 *
 * Flow:
 *   [Pre-Write Snapshot] → [Validate Content] → [Violation?] ─yes→ [Rollback] → [Notify AI]
 *                                                         └─no─→ [Allow Write]
 *
 * Key Innovation: Unlike simple blocking, this tells the AI WHY it was
 * blocked and gives it specific instructions to self-correct.
 */

import fs from "fs";
import path from "path";

// Rollback directory for durable snapshots (survives MCP restarts)
const ROLLBACK_DIR = ".atabey/rollbacks";

// ─── Snapshot Manager ─────────────────────────────────────────────

interface FileSnapshot {
    filePath: string;
    originalContent: string | null; // null = new file
    timestamp: number;
    traceId: string;
    restored: boolean;
}

class SnapshotManager {
    private snapshots: Map<string, FileSnapshot> = new Map();

    private getRollbackPath(resolvedPath: string, traceId: string): string {
        const safeName = resolvedPath.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 120);
        return path.join(process.cwd(), ROLLBACK_DIR, `${safeName}__${traceId}.bak`);
    }

    private ensureRollbackDir() {
        const dir = path.join(process.cwd(), ROLLBACK_DIR);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private saveDurableSnapshot(resolvedPath: string, snapshot: FileSnapshot) {
        try {
            this.ensureRollbackDir();
            const backupPath = this.getRollbackPath(resolvedPath, snapshot.traceId);
            const data = JSON.stringify({
                filePath: resolvedPath,
                originalContent: snapshot.originalContent,
                timestamp: snapshot.timestamp,
                traceId: snapshot.traceId,
            });
            fs.writeFileSync(backupPath, data, "utf8");
        } catch { /* best effort */ }
    }

    private loadDurableSnapshot(filePath: string): FileSnapshot | null {
        try {
            const resolved = path.resolve(filePath);
            // We don't know traceId here, so scan recent backups for this file (simple approach)
            const dir = path.join(process.cwd(), ROLLBACK_DIR);
            if (!fs.existsSync(dir)) return null;

            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith(".bak"))
                .sort()
                .reverse(); // newest first

            for (const f of files) {
                try {
                    const full = path.join(dir, f);
                    const content = fs.readFileSync(full, "utf8");
                    const data = JSON.parse(content);
                    if (data.filePath === resolved) {
                        return {
                            filePath: data.filePath,
                            originalContent: data.originalContent,
                            timestamp: data.timestamp,
                            traceId: data.traceId,
                            restored: false,
                        };
                    }
                } catch {}
            }
        } catch {}
        return null;
    }

    /**
     * Capture a pre-write snapshot of a file.
     * Also persists to disk for restart durability.
     */
    public capture(filePath: string, traceId: string): void {
        const resolvedPath = path.resolve(filePath);
        let originalContent: string | null = null;

        try {
            if (fs.existsSync(resolvedPath)) {
                originalContent = fs.readFileSync(resolvedPath, "utf8");
            }
        } catch { /* file doesn't exist yet (new file) */ }

        const snapshot: FileSnapshot = {
            filePath: resolvedPath,
            originalContent,
            timestamp: Date.now(),
            traceId,
            restored: false,
        };

        this.snapshots.set(resolvedPath, snapshot);
        this.saveDurableSnapshot(resolvedPath, snapshot);
    }

    /**
     * Get a snapshot for a file.
     * Falls back to durable backup if not in memory.
     */
    public get(filePath: string): FileSnapshot | undefined {
        const resolved = path.resolve(filePath);
        const mem = this.snapshots.get(resolved);
        if (mem) return mem;

        const durable = this.loadDurableSnapshot(resolved);
        if (durable) {
            this.snapshots.set(resolved, durable);
            return durable;
        }
        return undefined;
    }

    /**
     * Restore a file to its pre-write state.
     * Returns true if restored, false if no snapshot exists.
     */
    public restore(filePath: string): boolean {
        const resolvedPath = path.resolve(filePath);
        let snapshot = this.snapshots.get(resolvedPath);

        // Try durable fallback
        if (!snapshot) {
            snapshot = this.loadDurableSnapshot(resolvedPath) || undefined;
            if (snapshot) this.snapshots.set(resolvedPath, snapshot);
        }

        if (!snapshot || snapshot.restored) return false;

        try {
            if (snapshot.originalContent !== null) {
                // File existed before – restore original
                fs.writeFileSync(resolvedPath, snapshot.originalContent, "utf8");
                process.stderr.write(`[ROLLBACK] Restored: ${path.relative(process.cwd(), resolvedPath)}\n`);
            } else {
                // File was new – delete it
                if (fs.existsSync(resolvedPath)) {
                    fs.unlinkSync(resolvedPath);
                    process.stderr.write(`[ROLLBACK] Deleted (new file): ${path.relative(process.cwd(), resolvedPath)}\n`);
                }
            }

            snapshot.restored = true;

            // Remove durable backup
            try {
                const backupPath = this.getRollbackPath(resolvedPath, snapshot.traceId);
                if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
            } catch {}

            return true;
        } catch (error) {
            process.stderr.write(`[ROLLBACK] Failed to restore ${resolvedPath}: ${error}\n`);
            return false;
        }
    }

    /**
     * Clean up old snapshots (memory + durable files).
     */
    public cleanup(maxAgeMs: number = 300000): void {
        const cutoff = Date.now() - maxAgeMs;
        for (const [filePath, snapshot] of this.snapshots) {
            if (snapshot.timestamp < cutoff) {
                // Remove durable backup if exists
                try {
                    const backupPath = this.getRollbackPath(filePath, snapshot.traceId);
                    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
                } catch {}
                this.snapshots.delete(filePath);
            }
        }

        // Also clean old durable files on disk
        try {
            const dir = path.join(process.cwd(), ROLLBACK_DIR);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                for (const f of files) {
                    const full = path.join(dir, f);
                    try {
                        const stat = fs.statSync(full);
                        if (stat.mtimeMs < cutoff) {
                            fs.unlinkSync(full);
                        }
                    } catch {}
                }
            }
        } catch {}
    }

    /**
     * Get all active snapshots.
     */
    public getAll(): FileSnapshot[] {
        return Array.from(this.snapshots.values());
    }
}

// ─── Violation Record ─────────────────────────────────────────────

export interface ViolationRecord {
    rule: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    filePath: string;
    line: number;
    detail: string;
    regenerateInstruction: string;
}

// ─── Auto-Rollback Engine ─────────────────────────────────────────

export class AutoRollback {
    private static snapshots = new SnapshotManager();

    /**
     * Initialize the auto-rollback system.
     * Sets up file watcher cleanup.
     */
    public static initialize(): void {
        // Periodic cleanup of old snapshots (every 5 minutes)
        setInterval(() => {
            AutoRollback.snapshots.cleanup();
        }, 300000);
    }

    /**
     * Prepare for a file write by capturing the current state.
     * Call this BEFORE the tool handler writes to the file.
     */
    public static prepareWrite(filePath: string, traceId: string): void {
        AutoRollback.snapshots.capture(filePath, traceId);
    }

    /**
     * Validate content and rollback if violations are found.
     * This is called after the tool handler writes the file, but
     * BEFORE the response is returned to the AI.
     *
     * Returns:
     *   - null if content is clean
     *   - ViolationRecord[] if violations were found and rolled back
     */
    public static validateAndRollback(
        filePath: string,
        content: string,
        violations: ViolationRecord[]
    ): ViolationRecord[] | null {
        if (violations.length === 0) return null;

        // Restore the original file
        const restored = AutoRollback.snapshots.restore(filePath);

        if (restored) {
            process.stderr.write(`[ROLLBACK] Rolled back ${path.relative(process.cwd(), filePath)} due to ${violations.length} violation(s)\n`);
        }

        return violations;
    }

    /**
     * Build a regenerate instruction for the AI.
     * This is what gets sent back to the AI to tell it to fix its output.
     */
    public static buildRegenerateInstruction(
        violations: ViolationRecord[],
        toolName: string
    ): string {
        const criticalViolations = violations.filter(v => v.severity === "CRITICAL");

        const lines: string[] = [
            "## ⛔ AI Output Blocked – Governance Violation",
            "",
            `The code you generated for tool "${toolName}" has been BLOCKED and ROLLED BACK.`,
            "The file has been restored to its previous state.",
            "",
        ];

        if (criticalViolations.length > 0) {
            lines.push(`### 🔴 Critical Violations (${criticalViolations.length})`);
            lines.push("");
            for (const v of criticalViolations) {
                lines.push(`- **${v.rule}** (${v.filePath}:${v.line})`);
                lines.push(`  - Detail: ${v.detail}`);
                lines.push(`  - Fix: ${v.regenerateInstruction}`);
                lines.push("");
            }
        }

        const otherViolations = violations.filter(v => v.severity !== "CRITICAL");
        if (otherViolations.length > 0) {
            lines.push(`### 🟠 Other Violations (${otherViolations.length})`);
            lines.push("");
            for (const v of otherViolations) {
                lines.push(`- **${v.rule}** (${v.filePath}:${v.line})`);
                lines.push(`  - Detail: ${v.detail}`);
                lines.push(`  - Fix: ${v.regenerateInstruction}`);
                lines.push("");
            }
        }

        lines.push("---");
        lines.push("> **Instruction:** Please regenerate the code for this operation.");
        lines.push("> Address ALL violations listed above.");
        lines.push("> Do NOT reintroduce the same violations.");

        return lines.join("\n");
    }

    /**
     * Validate tool response content against governance rules.
     * Used by the MCP middleware to check file write content before returning.
     */
    public static checkWriteContent(
        filePath: string,
        content: string,
        traceId: string
    ): { allowed: boolean; violations: ViolationRecord[]; instruction: string | null } {
        const ext = path.extname(filePath).toLowerCase();
        const violations: ViolationRecord[] = [];

        // Only check source files
        if (![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rs", ".swift", ".kt"].includes(ext)) {
            return { allowed: true, violations: [], instruction: null };
        }

        const lines = content.split("\n");

        // 1. Check for `any` type (CRITICAL)
        if ([".ts", ".tsx"].includes(ext)) {
            for (let i = 0; i < lines.length; i++) {
                const anyMatch = lines[i].match(/:\s*any\b/);
                if (anyMatch) {
                    violations.push({
                        rule: "No `any` Type",
                        severity: "CRITICAL",
                        filePath,
                        line: i + 1,
                        detail: `Line ${i + 1}: ${anyMatch[0].substring(0, 60)}`,
                        regenerateInstruction: "Replace `any` with `unknown` and add proper type guards. Or use a specific interface/type.",
                    });
                }
            }
        }

        // 2. Check for console.log (CRITICAL)
        for (let i = 0; i < lines.length; i++) {
            const consoleMatch = lines[i].match(/console\.(log|error|warn|debug)\s*\(/);
            if (consoleMatch) {
                // Check if file is exempt
                if (!filePath.includes("logger.ts") && !filePath.includes("cli.ts") && !filePath.includes("compliance.ts")) {
                    violations.push({
                        rule: "No Console Log",
                        severity: "CRITICAL",
                        filePath,
                        line: i + 1,
                        detail: `Line ${i + 1}: ${consoleMatch[0].substring(0, 60)}`,
                        regenerateInstruction: "Replace with the project's logger (import from the appropriate logger module).",
                    });
                }
            }
        }

        // 3. Check for hardcoded secrets (HIGH)
        const secretPatterns = [
            { pattern: /(['"])sk-[a-zA-Z0-9]{20,}['"]/, name: "OpenAI API Key" },
            { pattern: /(['"])ghp_[a-zA-Z0-9]{36,}['"]/, name: "GitHub Token" },
            { pattern: /(['"])AIza[0-9A-Za-z_-]{35}['"]/, name: "Google API Key" },
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const { pattern, name } of secretPatterns) {
                if (pattern.test(lines[i])) {
                    violations.push({
                        rule: `Hardcoded Secret: ${name}`,
                        severity: "HIGH",
                        filePath,
                        line: i + 1,
                        detail: `Potential ${name} hardcoded at line ${i + 1}`,
                        regenerateInstruction: `Use environment variables (process.env.*) instead of hardcoding ${name}.`,
                    });
                }
            }
        }

        // If violations found, prepare snapshot and rollback
        if (violations.length > 0) {
            AutoRollback.prepareWrite(filePath, traceId);
            const rolledBack = AutoRollback.validateAndRollback(filePath, content, violations);
            const instruction = AutoRollback.buildRegenerateInstruction(violations, "write_file");

            return {
                allowed: false,
                violations: rolledBack || violations,
                instruction,
            };
        }

        return { allowed: true, violations: [], instruction: null };
    }

    /**
     * Get snapshot stats.
     */
    public static getSnapshotStats(): {
        total: number;
        restored: number;
        pending: number;
        } {
        const all = AutoRollback.snapshots.getAll();
        return {
            total: all.length,
            restored: all.filter(s => s.restored).length,
            pending: all.filter(s => !s.restored).length,
        };
    }
}

export { AutoRollback as AutoRollbackEngine };
