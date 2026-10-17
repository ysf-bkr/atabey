import fs from "fs";
import path from "path";
import { auditExportToCsv, auditExportToJson, buildAuditExport } from "../../modules/audit/export.js";
import { UI } from "../utils/ui.js";

/**
 * `atabey audit export [--format json|csv] [--out <file>] [--limit <n>]`
 * Exports the HMAC-signed audit trail.
 */
export async function auditCommand(args: string[]): Promise<void> {
    const sub = args[0] || "export";
    if (sub !== "export") {
        UI.error(`Unknown audit subcommand: "${sub}". Use: export [--format json|csv] [--out <file>] [--limit <n>]`);
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

    const exported = buildAuditExport({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
    const content = format === "csv" ? auditExportToCsv(exported) : auditExportToJson(exported);

    if (out) {
        fs.writeFileSync(path.resolve(out), content, "utf8");
        UI.success(`[AUDIT] Exported ${exported.count} entries (signed) → ${out}`);
    } else {
        process.stdout.write(content + "\n");
    }
}
