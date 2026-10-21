import fs from "fs";
import path from "path";
import { ValidationError } from "../../shared/errors.js";
import { computeTypesHash, writeJsonFile } from "../utils/fs.js";
import { getConfiguredPaths } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

function resolveContractPaths(projectRoot: string): { sharedDir: string; contractPath: string } {
    const pathsMap = getConfiguredPaths();
    const consumerSharedDir = path.join(projectRoot, pathsMap.backend, "src/types");
    const consumerContractPath = path.join(projectRoot, pathsMap.backend, "contract.version.json");

    if (fs.existsSync(consumerSharedDir)) {
        return { sharedDir: consumerSharedDir, contractPath: consumerContractPath };
    }

    const monorepoSharedDir = path.join(projectRoot, "packages/shared/src");
    const rootPkgPath = path.join(projectRoot, "package.json");
    let isMonorepo = false;
    if (fs.existsSync(rootPkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8")) as { frameworkRepo?: boolean; atabey?: { frameworkRepo?: boolean } };
            isMonorepo = Boolean(pkg.frameworkRepo || pkg.atabey?.frameworkRepo);
        } catch {
            isMonorepo = false;
        }
    }
    if (isMonorepo && fs.existsSync(monorepoSharedDir)) {
        return {
            sharedDir: monorepoSharedDir,
            contractPath: path.join(projectRoot, ".atabey/contract.version.json"),
        };
    }

    return { sharedDir: consumerSharedDir, contractPath: consumerContractPath };
}

function isTypeScriptBackend(projectRoot: string): boolean {
    try {
        const configPath = path.join(projectRoot, ".atabey", "config.json");
        if (!fs.existsSync(configPath)) return true;
        const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { backendLanguage?: string };
        const language = config.backendLanguage;
        if (!language) return true;
        return /typescript|node/i.test(language);
    } catch {
        return true;
    }
}

/**
 * Verify type safety between backend and frontend contracts.
 */
export async function verifyApiContractCommand(options: { silent?: boolean } = {}): Promise<boolean> {
    const projectRoot = process.cwd();
    const { sharedDir, contractPath } = resolveContractPaths(projectRoot);

    if (!isTypeScriptBackend(projectRoot)) {
        if (!options.silent) {
            UI.info("Contract verification applies to TypeScript backends only — skipped for this stack.");
        }
        return true;
    }

    if (!fs.existsSync(sharedDir) || !fs.existsSync(contractPath)) {
        if (options.silent) return false;
        throw new ValidationError(
            "API types or contract version file missing.",
            null,
            "Ensure you have initialized the project and the backend directory is correctly configured in config.json."
        );
    }

    const currentHash = computeTypesHash(projectRoot, sharedDir);
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    if (contract.contract_hash === currentHash) {
        if (!options.silent) {
            UI.success("Contract is valid and synchronized.");
            await reportApiDrift(projectRoot);
        }
        return true;
    } else {
        if (options.silent) return false;
        throw new ValidationError(
            "Contract drift detected!",
            { stored: contract.contract_hash, actual: currentHash },
            "Run 'npx atabey contract update' to re-synchronize the API contracts."
        );
    }
}

/**
 * Non-fatal API-catalog drift report (backend endpoints vs stored catalog).
 */
async function reportApiDrift(projectRoot: string): Promise<void> {
    try {
        const { dedupe, scanProjectForEndpoints, detectApiDrift, isApiDriftClean } = await import("atabey-shared/api-catalog.js");
        const { Storage } = await import("atabey-shared/storage.js");
        const current = dedupe(scanProjectForEndpoints(projectRoot));
        const drift = detectApiDrift(Storage.getApiEndpoints(), current);
        if (!isApiDriftClean(drift)) {
            UI.warning(
                `API drift detected (+${drift.added.length} / -${drift.removed.length} / ~${drift.changed.length}). ` +
                "Run 'atabey api scan' and update frontend consumers.",
            );
        }
    } catch {
        /* API catalog is optional */
    }
}

/**
 * Update and synchronize type safety between backend and frontend contracts.
 */
export async function updateApiContractCommand() {
    const projectRoot = process.cwd();
    const { sharedDir, contractPath } = resolveContractPaths(projectRoot);

    if (!isTypeScriptBackend(projectRoot)) {
        UI.info("Contract synchronization applies to TypeScript backends only — skipped for this stack.");
        return;
    }

    if (!fs.existsSync(sharedDir)) {
        throw new ValidationError(
            "API types directory missing.",
            null,
            "The directory specified for backend types does not exist. Check your framework configuration."
        );
    }

    const currentHash = computeTypesHash(projectRoot, sharedDir);

    const contractData = {
        contract_hash: currentHash,
        last_updated: new Date().toISOString()
    };

    writeJsonFile(contractPath, contractData);
    UI.success(`Contract successfully synchronized. New hash: ${currentHash}`);
}
