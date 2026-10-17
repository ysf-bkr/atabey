import fs from "fs";
import path from "path";
import {
    dedupe,
    detectApiDrift,
    isApiDriftClean,
    scanProjectForEndpoints,
    type ApiCatalog,
    type ApiEndpoint,
} from "atabey-shared/api-catalog.js";
import { Storage } from "atabey-shared/storage.js";
import { getFrameworkDir } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

function flag(args: string[], name: string): string | undefined {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith("-")) return args[i + 1];
    return undefined;
}

function writeJsonMirror(endpoints: ApiEndpoint[]): void {
    try {
        const dir = path.join(getFrameworkDir(), "contracts");
        fs.mkdirSync(dir, { recursive: true });
        const catalog: ApiCatalog = { version: 1, generatedAt: new Date().toISOString(), endpoints };
        fs.writeFileSync(path.join(dir, "api-registry.json"), JSON.stringify(catalog, null, 2));
    } catch {
        /* mirror is best-effort */
    }
}

function formatEndpoint(e: ApiEndpoint): string {
    const flags = [e.tag ? `[${e.tag}]` : "", e.authRequired ? "(auth)" : ""].filter(Boolean).join(" ");
    return `  ${e.method.padEnd(6)} ${e.path}${flags ? " " + flags : ""}  req=${e.requestSchema || "-"} res=${e.responseSchema || "-"}`;
}

export async function apiCommand(args: string[]): Promise<void> {
    const sub = (args[0] || "list").toLowerCase();

    if (sub === "scan") {
        const endpoints = dedupe(scanProjectForEndpoints(process.cwd()));
        const res = Storage.replaceApiCatalog(endpoints);
        writeJsonMirror(endpoints);
        UI.success(`API catalog updated: ${res.upserted} endpoint(s) stored, ${res.deleted} removed.`);
        UI.info(`Mirror written to ${path.join(getFrameworkDir(), "contracts", "api-registry.json")}`);
        return;
    }

    if (sub === "list") {
        const endpoints = Storage.getApiEndpoints({
            tag: flag(args, "--tag"),
            search: flag(args, "--search"),
            method: flag(args, "--method"),
        });
        if (endpoints.length === 0) {
            UI.info("API catalog is empty. Run 'atabey api scan' first.");
            return;
        }
        UI.info(`API Catalog (${endpoints.length} endpoint(s)):`);
        for (const e of endpoints) process.stdout.write(`${formatEndpoint(e)}\n`);
        return;
    }

    if (sub === "drift") {
        const current = dedupe(scanProjectForEndpoints(process.cwd()));
        const previous = Storage.getApiEndpoints();
        const drift = detectApiDrift(previous, current);
        if (isApiDriftClean(drift)) {
            UI.success("No API drift detected — stored catalog matches the code.");
            return;
        }
        UI.warning(
            `API drift detected: +${drift.added.length} added, -${drift.removed.length} removed, ~${drift.changed.length} changed.`,
        );
        for (const e of drift.added) process.stdout.write(`  + ${e.method} ${e.path}\n`);
        for (const e of drift.removed) process.stdout.write(`  - ${e.method} ${e.path}\n`);
        for (const c of drift.changed) process.stdout.write(`  ~ ${c.current.method} ${c.current.path}\n`);
        UI.info("Run 'atabey api scan' to refresh the catalog, then update frontend consumers.");
        process.exitCode = 1;
        return;
    }

    if (sub === "json") {
        const catalog: ApiCatalog = {
            version: 1,
            generatedAt: new Date().toISOString(),
            endpoints: Storage.getApiEndpoints({
                tag: flag(args, "--tag"),
                search: flag(args, "--search"),
                method: flag(args, "--method"),
            }),
        };
        process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
        return;
    }

    UI.error("Usage: atabey api <scan|list|drift|json> [--tag X] [--search X] [--method GET]");
}
