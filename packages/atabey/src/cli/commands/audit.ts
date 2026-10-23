import fs from "fs";
import path from "path";
import {
    auditExportToCsv,
    auditExportToJson,
    buildAuditExport,
    verifyAuditExport,
    type AuditExport,
} from "../../modules/audit/export.js";
import { UI } from "../utils/ui.js";

/**
 * `atabey audit export [--format json|csv] [--out <file>] [--limit <n>]`
 * Exports the HMAC-signed audit trail.
 *
 * `atabey audit export --verify [--in <file>]`
 * Verifies the signature of a freshly built bundle, or of an existing JSON
 * bundle written by a previous export. Exits non-zero when verification fails.
 *
 * `atabey audit erase <traceId>`
 * `atabey audit erase --all --confirm KVKK-RIGHT-TO-ERASURE`
 * KVKK Art. 7 / GDPR Art. 17 right-to-erasure (single trace or full wipe).
 */
export async function auditCommand(args: string[]): Promise<void> {
    const sub = args[0] || "export";

    if (sub === "erase") {
        await auditEraseCommand(args.slice(1));
        return;
    }

    if (sub !== "export") {
        UI.error(`Unknown audit subcommand: "${sub}". Use: export [--format json|csv] [--out <file>] [--limit <n>] [--verify [--in <file>]] | erase <traceId> | erase --all --confirm KVKK-RIGHT-TO-ERASURE`);
        return;
    }

    const flag = (name: string): string | undefined => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };

    const format = (flag("--format") || "json").toLowerCase();
    const out = flag("--out");
    const limitRaw = flag("--limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : 1000;
    const verify = args.includes("--verify");
    const inputFile = flag("--in");

    // ── Verify-only path: check an existing bundle, or self-check a fresh one ──
    if (verify) {
        if (format === "csv") {
            UI.error("[AUDIT] --verify requires JSON. CSV exports carry the hash as comments and cannot be re-verified.");
            process.exit(64);
        }

        let bundle: AuditExport;
        if (inputFile) {
            try {
                bundle = JSON.parse(fs.readFileSync(path.resolve(inputFile), "utf8")) as AuditExport;
            } catch (e) {
                UI.error(`[AUDIT] Cannot read export "${inputFile}": ${(e as Error).message}`);
                process.exit(1);
            }
        } else {
            bundle = buildAuditExport({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
        }

        if (!bundle || !Array.isArray(bundle.entries) || typeof bundle.count !== "number" || bundle.count !== bundle.entries.length) {
            UI.error(
                `[AUDIT] Bundle is inconsistent: count=${bundle?.count ?? "missing"} vs ` +
                `${Array.isArray(bundle?.entries) ? bundle.entries.length : "missing"} entries.`,
            );
            process.exit(1);
        }

        const ok = verifyAuditExport(bundle);
        if (ok) {
            UI.success(`[AUDIT] Signature verified: ${bundle.count} entries, contentHash=${bundle.contentHash.slice(0, 16)}…`);
            return;
        }
        UI.error(`[AUDIT] Signature MISMATCH for ${bundle.count} entries — the bundle was modified or the HMAC key differs.`);
        process.exit(1);
    }

    const exported = buildAuditExport({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
    const content = format === "csv" ? auditExportToCsv(exported) : auditExportToJson(exported);

    if (out) {
        fs.writeFileSync(path.resolve(out), content, "utf8");
        UI.success(`[AUDIT] Exported ${exported.count} entries (signed) → ${out}`);
    } else {
        process.stdout.write(content + "\n");
    }
}

/**
 * [KVKK Art. 7 / GDPR Art. 17] Right to erasure via CLI.
 * Replaces the former `/api/audit/erase` HTTP endpoint.
 */
async function auditEraseCommand(args: string[]): Promise<void> {
    const { DataRetention } = await import("atabey-shared/retention.js");

    const flag = (name: string): string | undefined => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const eraseAll = args.includes("--all");
    const confirm = flag("--confirm");
    const traceId = args.find((a) => !a.startsWith("-"));

    try {
        if (eraseAll) {
            const code = confirm || traceId || "";
            const changes = DataRetention.eraseAllData(code);
            UI.success(`[KVKK/GDPR] Full erasure complete: ${changes} record(s) deleted.`);
            return;
        }
        if (!traceId) {
            UI.error("Usage: atabey audit erase <traceId>  |  atabey audit erase --all --confirm KVKK-RIGHT-TO-ERASURE");
            process.exit(64);
        }
        const changes = DataRetention.eraseTraceData(traceId);
        UI.success(`[KVKK/GDPR] Trace ${traceId} erased: ${changes} record(s) deleted.`);
    } catch (e) {
        UI.error(`[AUDIT] Erasure failed: ${(e as Error).message}`);
        process.exit(1);
    }
}
