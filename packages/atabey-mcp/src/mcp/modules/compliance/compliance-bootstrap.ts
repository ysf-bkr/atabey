import { DataRetention } from "atabey-shared/retention.js";
import { getAuthStatus, initAuth } from "atabey-mcp/utils/auth.js";
import {
    applyAuthEnvFromConfig,
    applySandboxEnvFromConfig,
    resolveAuthConfig,
    resolveComplianceConfig,
    resolveSandboxConfig,
} from "atabey-mcp/utils/framework-config.js";
import { purgeExpiredSecurityState } from "atabey-mcp/utils/security-state.js";
import { logger } from "../../../shared/logger.js";

let bootstrapped = false;

/**
 * Apply KVKK/GDPR retention + consent logging on MCP server boot.
 */
export function bootstrapComplianceServices(projectRoot: string): { retention: boolean } {
    if (bootstrapped) {
        return { retention: true };
    }

    process.env.ATABEY_PROJECT_ROOT = projectRoot;

    // Phase 1.2–1.3: apply sandbox profile (enterprise → REQUIRED) before tools run
    applySandboxEnvFromConfig(projectRoot);
    const sandbox = resolveSandboxConfig(projectRoot);
    process.stderr.write(
        `[atabey-mcp] Sandbox runtime=${process.env.ATABEY_SANDBOX_RUNTIME || sandbox.runtime}` +
        ` required=${process.env.ATABEY_SANDBOX_REQUIRED === "true" || sandbox.required}\n`,
    );

    // Phase 2.1: apply auth.required from enterprise profile, then re-init auth
    applyAuthEnvFromConfig(projectRoot);
    const authCfg = resolveAuthConfig(projectRoot);
    initAuth();
    const st = getAuthStatus();
    process.stderr.write(
        `[atabey-mcp] Auth required=${st.required} enabled=${st.enabled} openAccess=${st.openAccess}` +
        ` (config.required=${authCfg.required})\n`,
    );

    const compliance = resolveComplianceConfig(projectRoot);
    const retentionEnabled = compliance.retentionEnabled;

    if (compliance.consentLogging) {
        process.stderr.write(
            `[atabey-mcp] Consent logging active (basis: ${compliance.dataProcessingBasis})\n`,
        );
    }

    // Phase 0.4: drop expired loop cooldowns so restarts do not re-block agents
    try {
        const purged = purgeExpiredSecurityState();
        if (purged.loopCleared > 0) {
            process.stderr.write(
                `[atabey-mcp] Purged ${purged.loopCleared} expired security cooldown(s)\n`,
            );
        }
    } catch (err) {
        logger.debug("Compliance bootstrap operation failed (non-fatal)", err);
    }

    // Phase 1.4: verify tamper-evident audit hash chains on boot (sync require-style)
    try {
        // Dynamic import is async; use Storage/Audit already available via graph after first tool use.
        // Defer integrity check to next tick so schema is ready without making bootstrap async.
        setImmediate(() => {
            void (async () => {
                try {
                    const { Storage } = await import("atabey-shared/storage.js");
                    Storage.getDB();
                    const { Audit } = await import("atabey-shared/audit.js");
                    Audit.initialize();
                    // [FIX] Retention starts only AFTER the audit schema exists
                    // (Audit.initialize creates audit_log) — otherwise every
                    // fresh install logs "Cleanup failed: no such table".
                    if (retentionEnabled) {
                        DataRetention.initialize();
                        process.stderr.write("[atabey-mcp] Data retention cleanup active (KVKK/GDPR)\n");
                    }
                    const logs = Storage.verifyLogIntegrity();
                    const structured = Audit.verifyIntegrity();
                    if (!logs.valid) {
                        process.stderr.write(
                            `[atabey-mcp] WARNING: Agent log hash chain INVALID — ${logs.reason || "unknown"}\n`,
                        );
                    }
                    if (!structured.valid) {
                        process.stderr.write(
                            `[atabey-mcp] WARNING: Structured audit hash chain INVALID — ${structured.reason || "unknown"}\n`,
                        );
                    }
                    if (logs.valid && structured.valid) {
                        process.stderr.write(
                            `[atabey-mcp] Audit hash chains OK (logs=${logs.checked ?? 0}, audit=${structured.checked ?? 0})\n`,
                        );
                    }
                } catch (err) {
                    logger.debug("Compliance bootstrap operation failed (non-fatal)", err);
                }
            })();
        });
    } catch (err) {
        logger.debug("Compliance bootstrap operation failed (non-fatal)", err);
    }

    bootstrapped = true;
    return { retention: compliance.retentionEnabled };
}

export async function shutdownComplianceServices(): Promise<void> {
    DataRetention.shutdown();
    bootstrapped = false;
}
