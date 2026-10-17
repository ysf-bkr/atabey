import { TraceID } from "../../shared/types.js";

export type MemoryCategory = "ARCHITECTURE" | "DECISION" | "CODE_SNIPPET" | "RULE" | "TASK_HISTORY";

export interface MemoryEntry {
    id: string;
    content: string;
    vector?: number[];
    metadata: {
        category: MemoryCategory;
        traceId?: TraceID;
        filePath?: string;
        tags: string[];
        createdAt: string;
    };
}

export interface MemorySearchResult {
    entry: MemoryEntry;
    score: number;
}
