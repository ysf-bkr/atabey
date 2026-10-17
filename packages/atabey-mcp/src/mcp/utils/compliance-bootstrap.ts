import { DataRetention } from "../../shared/retention.js";
import { getAuthStatus, initAuth } from "./auth.js";
import {
    applyAuthEnvFromConfig,
    applySandboxEnvFromConfig,
    resolveAuthConfig,
    resolveComplianceConfig,
    resolveSandboxConfig,
} from "./framework-config.js";
import { purgeExpiredSecurityState } from "./security-state.js";

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

    if (compliance.retentionEnabled) {
        DataRetention.initialize();
        process.stderr.write("[atabey-mcp] Data retention cleanup active (KVKK/GDPR)\n");
    }

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
    } catch {
        /* non-fatal if DB not ready */
    }

    // Phase 1.4: verify tamper-evident audit hash chains on boot (sync require-style)
    try {
        // Dynamic import is async; use Storage/Audit already available via graph after first tool use.
        // Defer integrity check to next tick so schema is ready without making bootstrap async.
        setImmediate(() => {
            void (async () => {
                try {
                    const { Storage } = await import("../../shared/storage.js");
                    Storage.getDB();
                    const { Audit } = await import("../../shared/audit.js");
                    Audit.initialize();
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
                } catch {
                    /* non-fatal */
                }
            })();
        });
    } catch {
        /* non-fatal */
    }

    bootstrapped = true;
    return { retention: compliance.retentionEnabled };
}

export async function shutdownComplianceServices(): Promise<void> {
    DataRetention.shutdown();
    bootstrapped = false;
}
