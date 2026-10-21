/**
 * [DB] Canonical Atabey Storage Engine (Single Source of Truth)
 * Central SQLite database for enterprise-scale multi-agent state management.
 *
 * The implementation is decomposed into domain modules (base, knowledge,
 * users, agents, messages, tasks, logs, costs, metadata, cooldowns,
 * approvals, discipline, code-graph, integrity, api-catalog) chained via
 * class inheritance. This module remains the stable public facade — the
 * AtabeyStorage API is unchanged; only the file layout was split
 * (2026-10-20 audit, S7).
 */

import { StorageApiCatalog } from "./api-catalog.js";

export * from "./types.js";
export { resolveFrameworkDir } from "./framework-dir.js";

export class AtabeyStorage extends StorageApiCatalog {}

/** Canonical alias */
export const Storage = AtabeyStorage;
