import fs from "fs";
import path from "path";
import { ValidationError } from "../../shared/errors.js";
import { computeTypesHash, writeJsonFile } from "../utils/fs.js";
import { getConfiguredPaths } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

/**
 * Verify type safety between backend and frontend contracts.
 */
export async function verifyApiContractCommand(options: { silent?: boolean } = {}): Promise<boolean> {
    const projectRoot = process.cwd();
    const pathsMap = getConfiguredPaths();
    const sharedDir = path.join(projectRoot, pathsMap.backend, "src/types");
    const contractPath = path.join(projectRoot, pathsMap.backend, "contract.version.json");

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
    const pathsMap = getConfiguredPaths();
    const sharedDir = path.join(projectRoot, pathsMap.backend, "src/types");
    const contractPath = path.join(projectRoot, pathsMap.backend, "contract.version.json");

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
