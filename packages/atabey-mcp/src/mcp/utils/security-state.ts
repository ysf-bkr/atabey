/**
 * Security State — durable cooldowns / discipline / loop gates (Phase 0.4).
 *
 * Problem: MCP stdio processes restart often; pure in-memory cooldowns reset and
 * agents can resume previously blocked behavior.
 *
 * Solution: SQLite tables (loop_cooldowns, discipline, approvals) via AtabeyStorage.
 * This module is the documented façade for that persistence layer.
 */

import { Storage } from "../../shared/storage.js";

export interface DurableLoopCooldown {
    agent: string;
    cooldownUntil: number;
    detail: string | null;
    cooldownCount: number;
}

export interface DurableDiscipline {
    agent: string;
    totalCalls: number;
    violations: number;
    lastViolation: string | null;
    cooldownUntil: number;
}

/**
 * Persist a loop-detector cooldown (survives process restart).
 */
export function persistLoopCooldown(
    agent: string,
    cooldownUntil: number,
    detail: string | null,
    cooldownCount = 1,
): void {
    Storage.saveLoopCooldown(agent, cooldownUntil, detail, cooldownCount);
}

/**
 * Load active loop cooldown or null if none / expired.
 */
export function loadLoopCooldown(agent: string): DurableLoopCooldown | null {
    return Storage.getLoopCooldown(agent);
}

/**
 * Clear durable loop cooldown for an agent.
 */
export function clearPersistedLoopCooldown(agent: string): boolean {
    return Storage.clearLoopCooldown(agent);
}

/**
 * Persist discipline counters + optional cooldown.
 */
export function persistDiscipline(stats: {
    agent: string;
    totalCalls: number;
    violations: number;
    lastViolation: string | null;
    cooldownUntil: number;
}): void {
    Storage.saveDiscipline(stats.agent, {
        totalCalls: stats.totalCalls,
        violations: stats.violations,
        lastViolation: stats.lastViolation,
        cooldownUntil: stats.cooldownUntil,
    });
}

/**
 * Load discipline snapshot for an agent.
 */
export function loadDiscipline(agent: string): DurableDiscipline | null {
    return Storage.getDiscipline(agent);
}

/**
 * List all agents with an active (non-expired) loop cooldown.
 */
export function listActiveLoopCooldowns(): DurableLoopCooldown[] {
    return Storage.listActiveLoopCooldowns();
}

/**
 * Purge expired security rows (loop cooldowns + zero stale discipline cooldowns).
 * Safe to call on MCP bootstrap.
 */
export function purgeExpiredSecurityState(): { loopCleared: number } {
    return { loopCleared: Storage.purgeExpiredLoopCooldowns() };
}
