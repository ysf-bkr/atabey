/**
 * [ENGINE] Contract Engine — API Versioning & Contract-First Enforcement
 *
 * Implements:
 * - API Versioning Strategy: /api/v1/... URL versioning, contract.version.json
 * - Contract-First: atabey verify-contract, contract_hash validation, auto-rollback
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { PhaseEngine } from "./phase-engine.js";

export interface ContractVersion {
    version: string;
    lastUpdated: string;
    contractHash: string;
    breakingChanges: Array<{ version: string; description: string }>;
    deprecatedVersions: string[];
}

export class ContractEngine {
    private static readonly CONTRACT_FILE = "contract.version.json";

    /**
     * Loads the contract.version.json file.
     */
    public static loadContract(projectRoot: string): ContractVersion | null {
        const contractPath = path.join(projectRoot, ContractEngine.CONTRACT_FILE);
        if (!fs.existsSync(contractPath)) return null;
        try {
            return JSON.parse(fs.readFileSync(contractPath, "utf8"));
        } catch {
            return null;
        }
    }

    /**
     * Computes SHA-256 hash of all shared type files in src/contracts or src/shared/types.
     */
    public static computeHash(projectRoot: string): string {
        const hash = crypto.createHash("sha256");
        const dirs = ["src/contracts", "src/shared/types", "src/types", "apps/backend/src/types"];

        for (const dir of dirs) {
            const fullPath = path.join(projectRoot, dir);
            if (fs.existsSync(fullPath)) {
                const files = fs.readdirSync(fullPath).filter(f => f.endsWith(".ts"));
                for (const file of files.sort()) {
                    const content = fs.readFileSync(path.join(fullPath, file), "utf8");
                    hash.update(content);
                }
            }
        }
        return hash.digest("hex").substring(0, 16);
    }

    /**
     * Verifies contract integrity. If hash changed, auto-triggers rollback.
     */
    public static async verifyContract(projectRoot: string): Promise<{
        valid: boolean;
        hash: string;
        previousHash: string;
        message: string;
    }> {
        const contract = ContractEngine.loadContract(projectRoot);
        const currentHash = ContractEngine.computeHash(projectRoot);

        if (!contract) {
            return { valid: false, hash: currentHash, previousHash: "", message: "contract.version.json not found. Create one with `atabey verify-contract --init`." };
        }

        const previousHash = contract.contractHash;
        const valid = currentHash === previousHash;

        if (!valid) {
            logger.warn(`[CONTRACT] Hash mismatch: ${previousHash} → ${currentHash}. Contracts changed!`);
            await PhaseEngine.detectBrokenContracts("@contract-engine");

            AtabeyStorage.saveLog({
                agent: "@architect",
                action: "CONTRACT_HASH_MISMATCH",
                trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
                status: "FAILED",
                summary: `Contract hash changed: ${previousHash} → ${currentHash}. Rollback triggered.`
            });
        }

        return { valid, hash: currentHash, previousHash, message: valid ? "Contracts valid." : "Contract hash mismatch! Run rollback." };
    }

    /**
     * Updates contract.version.json with current hash.
     */
    public static async updateContract(projectRoot: string, breaking: boolean): Promise<ContractVersion> {
        const existing = ContractEngine.loadContract(projectRoot);
        const newHash = ContractEngine.computeHash(projectRoot);

        const contract: ContractVersion = {
            version: existing ? ContractEngine.bumpVersion(existing.version, breaking) : "1.0",
            lastUpdated: new Date().toISOString(),
            contractHash: newHash,
            breakingChanges: existing?.breakingChanges || [],
            deprecatedVersions: existing?.deprecatedVersions || [],
        };

        if (breaking) {
            contract.breakingChanges.push({ version: contract.version, description: "Breaking change" });
        }

        fs.writeFileSync(path.join(projectRoot, ContractEngine.CONTRACT_FILE), JSON.stringify(contract, null, 2));

        AtabeyStorage.saveLog({
            agent: "@architect",
            action: "CONTRACT_UPDATED",
            trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
            status: "SUCCESS",
            summary: `Contract updated to v${contract.version} (hash: ${newHash})`
        });

        return contract;
    }

    /**
     * Validates that work is allowed in current phase before writing contracts.
     */
    public static validatePhaseForContract(workDescription: string): boolean {
        const phase = PhaseEngine.getCurrentPhase();
        if (phase === "PHASE_0" || phase === "PHASE_3" || phase === "PHASE_4") {
            logger.warn(`[CONTRACT] Phase ${phase} does not allow contract changes: ${workDescription}`);
            return false;
        }
        return true;
    }

    private static bumpVersion(current: string, breaking: boolean): string {
        const [major, minor] = current.split(".").map(Number);
        if (breaking) return `${major + 1}.0`;
        return `${major}.${minor + 1}`;
    }
}
