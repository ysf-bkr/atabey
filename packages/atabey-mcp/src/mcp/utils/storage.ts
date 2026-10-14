/**
 * [DB] Atabey Storage Unified Alias
 * Single Source of Truth (SSOT): Re-exports the canonical storage implementation
 * backed by .atabey/atabey.db via databaseHolder and paths resolution.
 */
export {
    AtabeyStorage,
    Storage,
    type AgentRow,
    type CostDbRow,
    type LogDbRow,
    type LogRow,
    type MessageDbRow,
    type MessageRow,
    type TaskDbRow,
    type TaskRow,
} from "../../shared/storage.js";
