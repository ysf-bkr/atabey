import { chainDigest, sha256Hex } from "atabey-shared/audit-chain.js";

/**
 * ─── EVIDENCE BUNDLE ─────────────────────────────────────────────────
 *
 * A tamper-evident proof-of-work issued at the end of every agent turn:
 * what changed, whether it passed the quality gate, how many tokens it cost,
 * and an HMAC signature over the canonical payload.
 *
 * This is the concrete artifact behind "Kanıtlı Teslimat" (proven delivery):
 * the user does not have to trust "the AI said it's done".
 */
export interface EvidenceBundle {
    taskId: string;
    agent: string;
    ok: boolean;
    changedFiles: string[];
    diffStat: string;
    tokens: { input: number; output: number; total: number };
    isolation: string;
    sandbox: string;
    quality?: { passed: boolean; reason: string };
    timestamp: string;
    /** SHA-256 of the canonical payload (content integrity). */
    contentHash: string;
    /** Keyed HMAC-SHA256 over the canonical payload (tamper-evidence). */
    signature: string;
}

export type EvidenceInput = Omit<EvidenceBundle, "timestamp" | "contentHash" | "signature">;

function canonicalPayload(b: Omit<EvidenceBundle, "contentHash" | "signature">): string {
    return JSON.stringify({
        taskId: b.taskId,
        agent: b.agent,
        ok: b.ok,
        changedFiles: [...b.changedFiles].sort(),
        diffStat: b.diffStat,
        tokens: b.tokens,
        isolation: b.isolation,
        sandbox: b.sandbox,
        quality: b.quality ?? null,
        timestamp: b.timestamp,
    });
}

export function buildEvidenceBundle(input: EvidenceInput): EvidenceBundle {
    const timestamp = new Date().toISOString();
    const payload = canonicalPayload({ ...input, timestamp });
    return {
        ...input,
        timestamp,
        contentHash: sha256Hex(payload),
        signature: chainDigest(payload),
    };
}

/** Re-derive the hashes and compare — detects any post-hoc tampering. */
export function verifyEvidenceBundle(bundle: EvidenceBundle): boolean {
    const payload = canonicalPayload(bundle);
    return sha256Hex(payload) === bundle.contentHash && chainDigest(payload) === bundle.signature;
}

/** Human-readable rendering (dashboard / CLI / PR comment). */
export function formatEvidenceBundle(b: EvidenceBundle): string {
    const lines = [
        `# Evidence Bundle — ${b.taskId}`,
        "",
        `- **Agent:** ${b.agent}`,
        `- **Result:** ${b.ok ? "✅ OK" : "❌ FAILED"}`,
        `- **Isolation:** ${b.isolation} · **Sandbox:** ${b.sandbox}`,
        `- **Tokens:** ${b.tokens.total} (in ${b.tokens.input} / out ${b.tokens.output})`,
        `- **Timestamp:** ${b.timestamp}`,
    ];
    if (b.quality) {
        lines.push(`- **Quality Gate:** ${b.quality.passed ? "✅ passed" : `❌ ${b.quality.reason}`}`);
    }
    lines.push("", "## Changed files");
    lines.push(b.changedFiles.length > 0 ? b.changedFiles.map((f) => `- ${f}`).join("\n") : "_none_");
    if (b.diffStat) {
        lines.push("", "## Diff stat", "```", b.diffStat, "```");
    }
    lines.push("", `**contentHash:** \`${b.contentHash}\``, `**signature:** \`${b.signature}\``);
    return lines.join("\n");
}
