import fs from "fs";
import { SecretManager, scanForSecrets } from "atabey-shared/secrets.js";
import { UI } from "../utils/ui.js";

/**
 * Read a secret value without exposing it in shell history / process args.
 * Priority: explicit argument → piped stdin → interactive prompt.
 */
function readSecretValue(name: string, explicit?: string): string | null {
    if (explicit !== undefined) return explicit;
    if (!process.stdin.isTTY) {
        try {
            const piped = fs.readFileSync(0, "utf8");
            const trimmed = piped.replace(/\r?\n$/, "");
            if (trimmed.length > 0) return trimmed;
        } catch {
            /* fall through to error */
        }
    }
    UI.error(`No value provided for "${name}". Pipe it in (echo -n "secret" | atabey secrets set ${name}) to avoid shell history.`);
    return null;
}

export async function secretsCommand(args: string[]): Promise<void> {
    const sub = (args[0] || "list").toLowerCase();

    if (sub === "set") {
        const name = args[1];
        if (!name) {
            UI.error("Usage: atabey secrets set <NAME> [VALUE] [description]  (omit VALUE to read from stdin)");
            process.exitCode = 64;
            return;
        }
        const value = readSecretValue(name, args[2]);
        if (value === null) {
            process.exitCode = 64;
            return;
        }
        const description = args.slice(3).join(" ") || undefined;
        SecretManager.setSecret(name, value, { description });
        UI.success(`Secret "${name}" encrypted and stored in AES-256-GCM vault.`);
        return;
    }

    if (sub === "get") {
        const name = args[1];
        if (!name) {
            UI.error("Usage: atabey secrets get <NAME>");
            process.exitCode = 64;
            return;
        }
        const val = SecretManager.getSecret(name);
        if (val === null) {
            UI.error(`Secret "${name}" not found in vault.`);
            process.exitCode = 1;
            return;
        }
        process.stdout.write(`${val}\n`);
        return;
    }

    if (sub === "delete" || sub === "rm") {
        const name = args[1];
        if (!name) {
            UI.error("Usage: atabey secrets delete <NAME>");
            process.exitCode = 64;
            return;
        }
        const deleted = SecretManager.deleteSecret(name);
        if (deleted) UI.success(`Secret "${name}" deleted from vault.`);
        else UI.warning(`Secret "${name}" was not found.`);
        return;
    }

    if (sub === "list" || sub === "ls") {
        const list = SecretManager.listSecrets();
        if (list.length === 0) {
            UI.info("Vault is empty (0 secrets stored).");
            return;
        }
        UI.info(`Stored secrets (${list.length}):`);
        for (const item of list) {
            process.stdout.write(
                `  - ${item.name} (updated: ${item.updatedAt})${item.description ? ` — ${item.description}` : ""}\n`,
            );
        }
        return;
    }

    if (sub === "scan") {
        const target = args[1] || ".";
        if (!fs.existsSync(target)) {
            UI.error(`Target path does not exist: ${target}`);
            process.exitCode = 64;
            return;
        }

        const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".atabey", ".agents", ".claude", ".cursor", ".gemini", ".grok", ".opencode"]);
        const SKIP_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
        const filesToScan: string[] = [];

        const collectFiles = (entryPath: string): void => {
            const stat = fs.statSync(entryPath);
            if (stat.isDirectory()) {
                for (const dirent of fs.readdirSync(entryPath, { withFileTypes: true })) {
                    if (dirent.isDirectory()) {
                        if (!SKIP_DIRS.has(dirent.name) && !dirent.name.startsWith(".temp")) {
                            collectFiles( `${entryPath}/${dirent.name}`);
                        }
                    } else if (dirent.isFile() && !SKIP_FILES.has(dirent.name)) {
                        filesToScan.push(`${entryPath}/${dirent.name}`);
                    }
                }
            } else if (stat.isFile()) {
                filesToScan.push(entryPath);
            }
        };

        collectFiles(target);

        let totalFindings = 0;
        for (const filePath of filesToScan) {
            try {
                // Skip test files when scanning a directory so test fixtures with fake keys aren't flagged
                if (filesToScan.length > 1 && (filePath.includes("/tests/") || filePath.endsWith(".test.ts"))) {
                    continue;
                }
                const content = fs.readFileSync(filePath, "utf8");
                const findings = scanForSecrets(content);
                if (findings.length > 0) {
                    totalFindings += findings.length;
                    UI.warning(`Detected ${findings.length} potential secret leak(s) in ${filePath}:`);
                    for (const f of findings) {
                        process.stdout.write(`  [${f.ruleId}] ${f.description} (${f.matchPreview}) at offset ${f.index}\n`);
                    }
                }
            } catch {
                /* skip unreadable/binary files */
            }
        }

        if (totalFindings === 0) {
            UI.success(`No secret leaks detected in ${target} (${filesToScan.length} file(s) scanned).`);
        } else {
            process.exitCode = 1;
        }
        return;
    }

    UI.error("Usage: atabey secrets <list|set|get|delete|scan>");
}
