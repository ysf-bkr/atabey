/**
 * [ENGINE] Phase Engine — State Machine for Development Lifecycle
 *
 * Implements the PHASE_0 → PHASE_4 state machine from ATABEY.md.
 * Prevents phase skipping and enforces rollback when contracts break.
 *
 * Phases:
 *   PHASE_0 (Discovery & Setup)     → Requirements analysis, docs validation
 *   PHASE_1 (Architecture & Contracts) → Data models, API schemas, types
 *   PHASE_2 (Core Development)      → Feature implementation
 *   PHASE_3 (Integration & Testing) → System integration, QA
 *   PHASE_4 (Optimization & Deployment) → Performance audit, deploy
 *
 * Rollback:
 *   If contracts break during PHASE_2+ → auto rollback to PHASE_1
 */

import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

export type Phase = "PHASE_0" | "PHASE_1" | "PHASE_2" | "PHASE_3" | "PHASE_4" | "ROLLBACK_PHASE_1";

export interface PhaseTransition {
    from: Phase;
    to: Phase;
    timestamp: string;
    reason: string;
    triggeredBy: string;
}

export interface PhaseRequirements {
    phase: Phase;
    name: string;
    allowedWork: string[];
    successCriteria: string[];
    prohibitedWork: string[];
}

/**
 * Phase Engine — manages the development lifecycle state machine.
 * Stored in Storage metadata under "phase" key.
 * Transition history stored in `.atabey/logs/phase-transitions.json`.
 */
export class PhaseEngine {
    private static readonly VALID_TRANSITIONS: Record<Phase, Phase[]> = {
        "PHASE_0": ["PHASE_1"],
        "PHASE_1": ["PHASE_2", "ROLLBACK_PHASE_1"],
        "PHASE_2": ["PHASE_3", "ROLLBACK_PHASE_1"],
        "PHASE_3": ["PHASE_4", "ROLLBACK_PHASE_1"],
        "PHASE_4": ["PHASE_0"], // Release → restart cycle
        "ROLLBACK_PHASE_1": ["PHASE_1"], // Rollback → fix → re-enter PHASE_1
    };

    private static readonly PHASE_DEFINITIONS: Record<Phase, PhaseRequirements> = {
        "PHASE_0": {
            phase: "PHASE_0",
            name: "Discovery & Setup",
            allowedWork: ["Requirement analysis", "Documentation validation", "Environment setup", "Scaffolding"],
            successCriteria: ["docs/README.md validated", "Technology stack confirmed", "Target audience identified"],
            prohibitedWork: ["Any code implementation", "Database migrations", "API development"],
        },
        "PHASE_1": {
            phase: "PHASE_1",
            name: "Architecture & Contracts",
            allowedWork: ["Type definitions", "API schema design", "Interface design", "Contract versioning"],
            successCriteria: ["contract.version.json created", "All shared types defined", "Frontend + Backend approve schemas"],
            prohibitedWork: ["Business logic implementation", "Database queries", "UI components"],
        },
        "PHASE_2": {
            phase: "PHASE_2",
            name: "Core Development",
            allowedWork: ["Feature implementation", "Business logic", "API endpoints", "UI components", "Tests"],
            successCriteria: ["All features implemented", "Tests passing", "Contract hash verified"],
            prohibitedWork: ["Production deployment", "Schema changes without rollback"],
        },
        "PHASE_3": {
            phase: "PHASE_3",
            name: "Integration & Testing",
            allowedWork: ["System integration", "End-to-end testing", "Performance testing", "Security audit"],
            successCriteria: ["All integration tests pass", "No critical bugs", "Security scan clean"],
            prohibitedWork: ["New features", "Schema changes"],
        },
        "PHASE_4": {
            phase: "PHASE_4",
            name: "Optimization & Deployment",
            allowedWork: ["Performance optimization", "Deployment", "Post-release monitoring"],
            successCriteria: ["Deployment successful", "Health checks passing", "Rollback plan ready"],
            prohibitedWork: ["New features", "Schema changes"],
        },
        "ROLLBACK_PHASE_1": {
            phase: "ROLLBACK_PHASE_1",
            name: "Contract Rollback",
            allowedWork: ["Contract repair", "Type definition fixes", "Schema corrections"],
            successCriteria: ["Contracts fixed", "contract_hash recalculated"],
            prohibitedWork: ["New features", "Deployment"],
        },
    };

    /**
     * Returns the current phase from storage.
     */
    public static getCurrentPhase(): Phase {
        const phase = AtabeyStorage.getMetadata("phase");
        return (phase as Phase) || "PHASE_0";
    }

    /**
     * Attempts to transition to a new phase.
     * Validates that the transition is allowed by the state machine.
     */
    public static async transitionTo(targetPhase: Phase, reason: string, triggeredBy: string): Promise<{
        success: boolean;
        from: Phase;
        to: Phase;
        error?: string;
    }> {
        const currentPhase = PhaseEngine.getCurrentPhase();
        const allowedTransitions = PhaseEngine.VALID_TRANSITIONS[currentPhase];

        if (!allowedTransitions || !allowedTransitions.includes(targetPhase)) {
            const errorMsg = `Phase transition ${currentPhase} → ${targetPhase} is NOT ALLOWED. Allowed: ${allowedTransitions?.join(", ") || "none"}`;
            logger.warn(`[PHASE] ${errorMsg}`);

            AtabeyStorage.saveLog({
                agent: triggeredBy,
                action: "PHASE_TRANSITION_BLOCKED",
                trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
                status: "FAILED",
                summary: errorMsg
            });

            return {
                success: false,
                from: currentPhase,
                to: targetPhase,
                error: errorMsg,
            };
        }

        // Execute transition
        AtabeyStorage.setMetadata("phase", targetPhase);

        // Log transition
        AtabeyStorage.saveLog({
            agent: triggeredBy,
            action: "PHASE_TRANSITION",
            trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
            status: "SUCCESS",
            summary: `${currentPhase} → ${targetPhase}: ${reason}`
        });

        logger.info(`[PHASE] ${currentPhase} → ${targetPhase} (by ${triggeredBy}): ${reason}`);

        // If entering ROLLBACK, notify all agents to switch to WAITING
        if (targetPhase === "ROLLBACK_PHASE_1") {
            await PhaseEngine.notifyAgentsOfRollback();
        }

        return {
            success: true,
            from: currentPhase,
            to: targetPhase,
        };
    }

    /**
     * Checks if a given work type is allowed in the current phase.
     */
    public static isWorkAllowed(work: string): boolean {
        const currentPhase = PhaseEngine.getCurrentPhase();
        const phaseDef = PhaseEngine.PHASE_DEFINITIONS[currentPhase];

        if (!phaseDef) return false;

        const workLower = work.toLowerCase();
        return phaseDef.allowedWork.some(allowed => workLower.includes(allowed.toLowerCase()));
    }

    /**
     * Returns the requirements for the current phase.
     */
    public static getCurrentPhaseRequirements(): PhaseRequirements {
        const currentPhase = PhaseEngine.getCurrentPhase();
        return PhaseEngine.PHASE_DEFINITIONS[currentPhase] || PhaseEngine.PHASE_DEFINITIONS["PHASE_0"];
    }

    /**
     * Checks if all success criteria for the current phase are met.
     */
    public static async checkPhaseCompletion(): Promise<{
        complete: boolean;
        missingCriteria: string[];
    }> {
        const phaseDef = PhaseEngine.getCurrentPhaseRequirements();
        const missingCriteria: string[] = [];

        for (const criteria of phaseDef.successCriteria) {
            // Check if the criteria has been logged as completed
            const logs = AtabeyStorage.getLogs();
            const isCompleted = logs.some(l =>
                l.action === "PHASE_CRITERIA_MET" &&
                l.summary.includes(criteria)
            );
            if (!isCompleted) {
                missingCriteria.push(criteria);
            }
        }

        return {
            complete: missingCriteria.length === 0,
            missingCriteria,
        };
    }

    /**
     * Marks a success criterion as completed.
     */
    public static async markCriteriaMet(criteria: string, agent: string): Promise<void> {
        AtabeyStorage.saveLog({
            agent,
            action: "PHASE_CRITERIA_MET",
            trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
            status: "SUCCESS",
            summary: criteria
        });

        logger.info(`[PHASE] Criteria met: ${criteria} (by ${agent})`);
    }

    /**
     * Detects if contracts are broken and auto-triggers rollback.
     * Called by ContractEngine when contract_hash changes unexpectedly.
     */
    public static async detectBrokenContracts(triggeredBy: string): Promise<void> {
        const currentPhase = PhaseEngine.getCurrentPhase();

        if (currentPhase === "PHASE_2" || currentPhase === "PHASE_3" || currentPhase === "PHASE_4") {
            logger.warn(`[PHASE] Broken contracts detected in ${currentPhase}. Auto-rolling back to PHASE_1.`);
            await PhaseEngine.transitionTo(
                "ROLLBACK_PHASE_1",
                "Contract hash mismatch detected — automatic rollback",
                triggeredBy
            );
        }
    }

    /**
     * Notifies all agents to switch to WAITING state during rollback.
     */
    private static async notifyAgentsOfRollback(): Promise<void> {
        const agents = AtabeyStorage.getAllAgents();
        for (const agent of agents) {
            if (agent.state === "EXECUTING" || agent.state === "COMPLETED") {
                AtabeyStorage.updateAgentStatus(
                    agent.name,
                    "WAITING",
                    `Contract rollback in progress — phase reset to PHASE_1`
                );
            }
        }

        logger.info("[PHASE] All agents notified of rollback. Waiting for contract fixes.");
    }
}
