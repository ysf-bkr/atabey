// Import types locally for ToolArgs union usage

// Re-export all argument types from schemas.ts (single source of truth via z.infer<>)
// This allows handler files to import from "../types.js" without changes.
export type {
    AcquireLockArgs,
    AnalyzeCodeQualityArgs,
    BatchSurgicalEditArgs,
    CheckArchitectureComplianceArgs,
    CheckPortsArgs,
    GetProjectGapsArgs,
    GetProjectMapArgs,
    GrepSearchArgs,
    ListDirArgs,
    LogAgentActionArgs,
    PatchFileArgs,
    ReadFileArgs,
    RegisterAgentArgs,
    ReleaseLockArgs,
    ReplaceTextArgs,
    RunShellCommandArgs,
    RunTestsArgs,
    SendAgentMessageArgs,
    UpdateProjectMemoryArgs,
    WriteFileArgs
} from "./schemas.js";

// Legacy aliases — some handlers still import these names
export type {
    CheckPortsArgs as CheckActivePortsArgs,
    RunShellCommandArgs as RunCommandArgs
} from "./schemas.js";

// Empty-schema argument types (handlers that use _args or typed as generic)
export type GetStatusArgs = Record<string, never>;
export type OrchestrateArgs = Record<string, never>;
export type UpdateContractHashArgs = Record<string, never>;

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Generic tool arguments type.
 * Handler functions receive `args: unknown` and cast internally.
 * Zod schemas in schemas.ts provide the actual runtime validation.
 */
export type ToolArgs = Record<string, unknown>;

export interface ToolResult {
    isError?: boolean;
    content: Array<{ type: "text"; text: string }>;
}

export type ToolHandler = (projectRoot: string, args: unknown) => ToolResult | Promise<ToolResult>;
