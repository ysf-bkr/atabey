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
        const target = args[1];
        if (!target || !fs.existsSync(target)) {
            UI.error("Usage: atabey secrets scan <file>");
            process.exitCode = 64;
            return;
        }
        const content = fs.readFileSync(target, "utf8");
        const findings = scanForSecrets(content);
        if (findings.length === 0) {
            UI.success(`No secret leaks detected in ${target}.`);
        } else {
            UI.warning(`Detected ${findings.length} potential secret leak(s) in ${target}:`);
            for (const f of findings) {
                process.stdout.write(`  [${f.ruleId}] ${f.description} (${f.matchPreview}) at offset ${f.index}\n`);
            }
            process.exitCode = 1;
        }
        return;
    }

    UI.error("Usage: atabey secrets <list|set|get|delete|scan>");
}
