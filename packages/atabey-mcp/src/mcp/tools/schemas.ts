import { z } from "zod";

/**
 * ─── ATABEY VALIDATED TYPES ────────────────────────────────────────
 * Zod schemas with regex + min-length validation for runtime safety.
 * NOTE: Brand types (intersection types) are defined in src/shared/types.ts.
 * These schemas provide runtime validation only; type branding is not
 * possible at runtime via Zod's .brand() — it's a no-op.
 */

export const AgentIDSchema = z.string()
    .regex(/^@[a-zA-Z0-9_-]+$/, "AgentID must start with '@' followed by alphanumeric characters/underscores.")
    .min(2);

export const TraceIDSchema = z.string()
    .min(1, "TraceID cannot be empty");

export const TaskIDSchema = z.string()
    .regex(/^TASK-[0-9]+$/, "TaskID must follow the format 'TASK-001'.")
    .min(1);

export const PhaseIDSchema = z.enum(["PHASE_0", "PHASE_1", "PHASE_2", "PHASE_3", "PHASE_4"]);

/**
 * ─── TOOL CONTRACTS ────────────────────────────────────────────────
 * Every tool must have a strict schema defining its boundary.
 * No unknown properties are allowed (.strict()).
 */

// ─── File System
export const ReadFileSchema = z.object({
    path: z.string().min(1, "Path is required"),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
}).strict();

export const WriteFileSchema = z.object({
    path: z.string().min(1, "Path is required"),
    content: z.string(),
}).strict();

export const ReplaceTextSchema = z.object({
    path: z.string().min(1, "Path is required"),
    oldText: z.string().min(1, "oldText is required"),
    newText: z.string(),
    allowMultiple: z.boolean().optional().default(false),
}).strict();

// ─── Search & Exploration
export const ListDirSchema = z.object({
    path: z.string().default("."),
}).strict();

export const GrepSearchSchema = z.object({
    pattern: z.string().min(1, "Pattern is required"),
    includePattern: z.string().optional(),
    excludePattern: z.string().optional(),
}).strict();

export const GetProjectMapSchema = z.object({
    maxDepth: z.number().int().positive().default(3),
    includeFiles: z.boolean().default(true),
}).strict();

export const GetProjectGapsSchema = z.object({
    path: z.string().default("src"),
}).strict();

// ─── Batch & Patch
export const BatchSurgicalEditSchema = z.object({
    edits: z.array(z.object({
        path: z.string().min(1),
        oldText: z.string().min(1),
        newText: z.string(),
        allowMultiple: z.boolean().optional().default(false),
    })),
}).strict();

export const PatchFileSchema = z.object({
    path: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    newContent: z.string(),
}).strict();

// ─── Framework & System
export const RunShellCommandSchema = z.object({
    command: z.string().min(1),
}).strict();

export const RunTestsSchema = z.object({
    command: z.string().optional(),
}).strict();

export const GetSystemHealthSchema = z.object({}).strict();
export const CheckPortsSchema = z.object({
    filter: z.string().optional(),
}).strict();

export const GetFrameworkStatusSchema = z.object({}).strict();
export const ReadProjectMemorySchema = z.object({}).strict();
export const GetMemoryInsightsSchema = z.object({}).strict();

export const UpdateProjectMemorySchema = z.object({
    section: z.string().min(1),
    content: z.string().min(1),
}).strict();

export const OrchestrateLoopSchema = z.object({}).strict();

export const SubmitPlanSchema = z.object({
    tasks: z.array(z.object({
        id: TaskIDSchema,
        agent: AgentIDSchema,
        task: z.string().min(1),
        dependencies: z.array(TaskIDSchema).optional(),
    })),
}).strict();

export const AcquireLockSchema = z.object({
    resource: z.string().min(1),
    agent: AgentIDSchema,
    ttl: z.number().int().positive().optional().default(60),
}).strict();

export const ReleaseLockSchema = z.object({
    resource: z.string().min(1),
    agent: AgentIDSchema,
}).strict();

export const RegisterAgentSchema = z.object({
    agent: AgentIDSchema,
    role: z.string().min(1),
    capability: z.number().int().min(1).max(10).optional().default(5),
    specialties: z.record(z.number()).optional(),
}).strict();

export const UpdateContractHashSchema = z.object({}).strict();
export const AuditDependenciesSchema = z.object({}).strict();
export const CheckLintSchema = z.object({}).strict();

// ─── Memory (Core Memory)
export const StoreKnowledgeSchema = z.object({
    content: z.string().min(1, "Content is required"),
    category: z.enum(["ARCHITECTURE", "DECISION", "CODE_SNIPPET", "RULE", "TASK_HISTORY"]),
    tags: z.array(z.string()).optional(),
    filePath: z.string().optional(),
    traceId: z.string().optional(),
}).strict();

export const SearchKnowledgeSchema = z.object({
    query: z.string().min(1, "Query is required"),
    category: z.enum(["ARCHITECTURE", "DECISION", "CODE_SNIPPET", "RULE", "TASK_HISTORY"]).optional(),
    limit: z.number().int().positive().optional().default(5),
}).strict();

export const DeleteKnowledgeSchema = z.object({
    id: z.string().optional(),
    category: z.enum(["ARCHITECTURE", "DECISION", "CODE_SNIPPET", "RULE", "TASK_HISTORY"]).optional(),
}).strict();

// ─── Messaging (Hermes)
export const SendAgentMessageSchema = z.object({
    from: AgentIDSchema,
    to: AgentIDSchema,
    category: z.enum(["ACTION", "DELEGATION", "SUBTASK", "REPLY", "ALERT"]),
    content: z.string().min(1, "Content cannot be empty"),
    traceId: TraceIDSchema,
    parentId: TaskIDSchema.optional(),
    priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional().default("NORMAL"),
    requiresApproval: z.boolean().optional().default(false),
}).strict();

export const LogAgentActionSchema = z.object({
    agent: AgentIDSchema,
    action: z.string().min(1),
    traceId: TraceIDSchema,
    status: z.enum(["SUCCESS", "FAILURE"]),
    summary: z.string().min(1),
    findings: z.string().optional(),
}).strict();

export const AskHumanSchema = z.object({
    question: z.string().min(10, "Question must be clear and detailed."),
    timeoutSeconds: z.number().int().positive().optional().default(120),
}).strict();

export const ApproveOperationSchema = z.object({
    action: z.enum(["approve", "reject", "list"]),
    traceId: z.string().optional(),
    reason: z.string().optional(),
}).strict();

// ─── Code Quality Analysis ──────────────────────────────────────────
export const AnalyzeCodeQualitySchema = z.object({
    path: z.string().min(1, "Path to analyze is required"),
    checkTypes: z.boolean().optional().default(true),
    checkLint: z.boolean().optional().default(true),
    checkComplexity: z.boolean().optional().default(true),
}).strict();

// ─── Architecture Compliance ────────────────────────────────────────
export const CheckArchitectureComplianceSchema = z.object({
    path: z.string().min(1, "Path to check is required"),
    rules: z.array(z.string()).optional(),
}).strict();

// ─── PII / Compliance ───────────────────────────────────────────────
export const MaskPIISchema = z.object({
    text: z.string().optional(),
    data: z.record(z.unknown()).optional(),
    mode: z.enum(["text", "object", "auto"]).optional().default("auto"),
    strictMode: z.boolean().optional().default(false),
}).strict();

// ─── Compression / Archiving ────────────────────────────────────────
export const CompressFilesSchema = z.object({
    sourcePath: z.string().min(1, "sourcePath is required"),
    outputPath: z.string().min(1, "outputPath is required"),
    format: z.enum(["zip", "tar", "gzip"]),
}).strict();

export const DecompressFilesSchema = z.object({
    archivePath: z.string().min(1, "archivePath is required"),
    outputPath: z.string().min(1, "outputPath is required"),
    format: z.enum(["zip", "tar", "gzip"]).optional(),
}).strict();

/**
 * ─── TYPE INFERENCE ────────────────────────────────────────────────
 * Deriving types directly from schemas to ensure ZERO DRIFT.
 * Every exported type below is used by types.ts' ToolArgs union.
 */
export type ReadFileArgs = z.infer<typeof ReadFileSchema>;
export type WriteFileArgs = z.infer<typeof WriteFileSchema>;
export type ReplaceTextArgs = z.infer<typeof ReplaceTextSchema>;
export type PatchFileArgs = z.infer<typeof PatchFileSchema>;
export type BatchSurgicalEditArgs = z.infer<typeof BatchSurgicalEditSchema>;
export type ListDirArgs = z.infer<typeof ListDirSchema>;
export type GrepSearchArgs = z.infer<typeof GrepSearchSchema>;
export type GetProjectMapArgs = z.infer<typeof GetProjectMapSchema>;
export type GetProjectGapsArgs = z.infer<typeof GetProjectGapsSchema>;
export type SendAgentMessageArgs = z.infer<typeof SendAgentMessageSchema>;
export type LogAgentActionArgs = z.infer<typeof LogAgentActionSchema>;
export type AcquireLockArgs = z.infer<typeof AcquireLockSchema>;
export type ReleaseLockArgs = z.infer<typeof ReleaseLockSchema>;
export type RegisterAgentArgs = z.infer<typeof RegisterAgentSchema>;
export type CheckPortsArgs = z.infer<typeof CheckPortsSchema>;
export type RunTestsArgs = z.infer<typeof RunTestsSchema>;
export type UpdateProjectMemoryArgs = z.infer<typeof UpdateProjectMemorySchema>;
export type RunShellCommandArgs = z.infer<typeof RunShellCommandSchema>;
export type AnalyzeCodeQualityArgs = z.infer<typeof AnalyzeCodeQualitySchema>;
export type CheckArchitectureComplianceArgs = z.infer<typeof CheckArchitectureComplianceSchema>;
export type ApproveOperationArgs = z.infer<typeof ApproveOperationSchema>;
export type CompressFilesArgs = z.infer<typeof CompressFilesSchema>;
export type DecompressFilesArgs = z.infer<typeof DecompressFilesSchema>;

// ─── Network Proxy Request ──────────────────────────────────────────
export const HttpProxyRequestSchema = z.object({
    url: z.string().url("Geçerli bir URL girilmelidir"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    proxyUrl: z.string().url("Geçerli bir proxy URL'i girilmelidir (örn: http://proxy:port)").optional(),
}).strict();

export type HttpProxyRequestArgs = z.infer<typeof HttpProxyRequestSchema>;


