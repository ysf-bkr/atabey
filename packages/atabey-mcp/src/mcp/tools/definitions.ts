import { ToolDefinition } from "../tools/types.js";
import { zodToMcpSchema } from "../utils/zod-to-mcp.js";
import * as schemas from "./schemas.js";

/**
 * ─── SUPREME TOOL REGISTRY ─────────────────────────────────────────
 * Every tool is dynamically generated from its Zod schema.
 * ZERO manual JSON schema maintenance permitted.
 */
export const TOOLS: ToolDefinition[] = [
    // File System
    {
        name: "read_file",
        description: "Read the content of a file within the project. Supports optional line range reading to prevent stream overload.",
        inputSchema: zodToMcpSchema(schemas.ReadFileSchema),
    },
    {
        name: "view_file",
        description: "Alias for read_file. Views the content of a file within the project.",
        inputSchema: zodToMcpSchema(schemas.ReadFileSchema),
    },
    {
        name: "write_file",
        description: "Write content to a file. Creates directories if missing.",
        inputSchema: zodToMcpSchema(schemas.WriteFileSchema),
    },
    {
        name: "replace_text",
        description: "Surgically replace a string in a file with another string.",
        inputSchema: zodToMcpSchema(schemas.ReplaceTextSchema),
    },
    {
        name: "batch_surgical_edit",
        description: "Perform multiple surgical text replacements across multiple files in a single batch request.",
        inputSchema: zodToMcpSchema(schemas.BatchSurgicalEditSchema),
    },
    {
        name: "patch_file",
        description: "Safely update a file by replacing a specific line range with new content.",
        inputSchema: zodToMcpSchema(schemas.PatchFileSchema),
    },

    // Search & Exploration
    {
        name: "list_dir",
        description: "List the contents of a directory. Essential for codebase exploration.",
        inputSchema: zodToMcpSchema(schemas.ListDirSchema),
    },
    {
        name: "grep_search",
        description: "Perform a recursive regex search across the codebase.",
        inputSchema: zodToMcpSchema(schemas.GrepSearchSchema),
    },
    {
        name: "get_project_map",
        description: "Generate a tree-view map of the project structure.",
        inputSchema: zodToMcpSchema(schemas.GetProjectMapSchema),
    },
    {
        name: "get_project_gaps",
        description: "Scans the codebase for TODOs, FIXMEs, and empty function bodies.",
        inputSchema: zodToMcpSchema(schemas.GetProjectGapsSchema),
    },

    // Framework & System
    {
        name: "run_shell_command",
        description: "Execute a shell command. Restricted for security.",
        inputSchema: zodToMcpSchema(schemas.RunShellCommandSchema),
    },
    {
        name: "run_tests",
        description: "Execute project test suites and capture pass/fail reports.",
        inputSchema: zodToMcpSchema(schemas.RunTestsSchema),
    },
    {
        name: "get_system_health",
        description: "Retrieve real-time system metrics (CPU, RAM).",
        inputSchema: zodToMcpSchema(schemas.GetSystemHealthSchema),
    },
    {
        name: "check_active_ports",
        description: "Identify which network ports are currently active.",
        inputSchema: zodToMcpSchema(schemas.CheckPortsSchema),
    },
    {
        name: "get_framework_status",
        description: "Get the current project phase, active traces, and agent states.",
        inputSchema: zodToMcpSchema(schemas.GetFrameworkStatusSchema),
    },
    {
        name: "read_project_memory",
        description: "Read the full project central memory (PROJECT_MEMORY.md).",
        inputSchema: zodToMcpSchema(schemas.ReadProjectMemorySchema),
    },
    {
        name: "get_memory_insights",
        description: "Retrieve a summarized version of the project memory.",
        inputSchema: zodToMcpSchema(schemas.GetMemoryInsightsSchema),
    },
    {
        name: "update_project_memory",
        description: "Update a specific section in PROJECT_MEMORY.md.",
        inputSchema: zodToMcpSchema(schemas.UpdateProjectMemorySchema),
    },

    // Memory (Core Memory)
    {
        name: "store_knowledge",
        description: "Store a new piece of project knowledge, decision, or code snippet into the vector-based core memory.",
        inputSchema: zodToMcpSchema(schemas.StoreKnowledgeSchema),
    },
    {
        name: "search_knowledge",
        description: "Search the vector-based core memory for relevant project knowledge, past decisions, or rules.",
        inputSchema: zodToMcpSchema(schemas.SearchKnowledgeSchema),
    },
    {
        name: "delete_knowledge",
        description: "Delete an obsolete or incorrect knowledge entry from the Core Memory.",
        inputSchema: zodToMcpSchema(schemas.DeleteKnowledgeSchema),
    },
    {
        name: "orchestrate_loop",
        description: "Process pending Hermes messages and trigger transitions.",
        inputSchema: zodToMcpSchema(schemas.OrchestrateLoopSchema),
    },
    {
        name: "submit_plan",
        description: "Submit a structured DAG plan of tasks for the project.",
        inputSchema: zodToMcpSchema(schemas.SubmitPlanSchema),
    },
    {
        name: "update_contract_hash",
        description: "Re-generate and synchronize the backend contract SHA-256 hash.",
        inputSchema: zodToMcpSchema(schemas.UpdateContractHashSchema),
    },
    {
        name: "audit_dependencies",
        description: "Audits package.json for unused or redundant packages.",
        inputSchema: zodToMcpSchema(schemas.AuditDependenciesSchema),
    },
    {
        name: "check_lint",
        description: "Run the project's linter (e.g., ESLint).",
        inputSchema: zodToMcpSchema(schemas.CheckLintSchema),
    },

    // Control Plane
    {
        name: "acquire_lock",
        description: "Acquire a stateful lock on a shared resource.",
        inputSchema: zodToMcpSchema(schemas.AcquireLockSchema),
    },
    {
        name: "release_lock",
        description: "Release a previously acquired lock.",
        inputSchema: zodToMcpSchema(schemas.ReleaseLockSchema),
    },
    {
        name: "register_agent",
        description: "Register an agent instance with the Control Plane.",
        inputSchema: zodToMcpSchema(schemas.RegisterAgentSchema),
    },

    // Messaging (Hermes)
    {
        name: "send_agent_message",
        description: "Send a Hermes protocol message to another agent.",
        inputSchema: zodToMcpSchema(schemas.SendAgentMessageSchema),
    },
    {
        name: "log_agent_action",
        description: "Log an agent action to the framework logs.",
        inputSchema: zodToMcpSchema(schemas.LogAgentActionSchema),
    },
    {
        name: "ask_human",
        description: "Pause execution and ask the human developer a clarifying question via the terminal.",
        inputSchema: zodToMcpSchema(schemas.AskHumanSchema),
    },

    // ─── PII / Compliance ─────────────────────────────────────────
    {
        name: "mask_pii",
        description: "Mask Personally Identifiable Information (PII) in text or structured data. Compliant with KVKK (Law No. 6698) and GDPR. Detects and masks emails, phone numbers, TC IDs, API keys, tokens, IPs, credit cards, IBANs, and more.",
        inputSchema: zodToMcpSchema(schemas.MaskPIISchema),
    },

    // ─── Code Quality ─────────────────────────────────────────────
    {
        name: "analyze_code_quality",
        description: "Analyze code quality in a given path. Checks TypeScript types, lint rules, and code complexity.",
        inputSchema: zodToMcpSchema(schemas.AnalyzeCodeQualitySchema),
    },
    {
        name: "check_architecture_compliance",
        description: "Check architecture compliance in a given path. Verifies layer boundaries (Controller→Service→Repository), import direction rules, and strict mode.",
        inputSchema: zodToMcpSchema(schemas.CheckArchitectureComplianceSchema),
    },

    // ─── Human-in-the-Loop ────────────────────────────────────────
    {
        name: "approve_operation",
        description: "Approve, reject, or list pending risk-gated operations. Use this when an operation was blocked by the Risk Gate (risk score ≥ 60). Action: 'approve' | 'reject' | 'list'.",
        inputSchema: zodToMcpSchema(schemas.ApproveOperationSchema),
    },
    // ─── Compression / Archiving ──────────────────────────────────
    {
        name: "compress_files",
        description: "Compress/archive files or directories into ZIP, TAR, or GZIP formats.",
        inputSchema: zodToMcpSchema(schemas.CompressFilesSchema),
    },
    {
        name: "decompress_files",
        description: "Extract/decompress files or directories from ZIP, TAR, or GZIP archives.",
        inputSchema: zodToMcpSchema(schemas.DecompressFilesSchema),
    },
    // ─── Network Proxy Request ─────────────────────────────────────
    {
        name: "http_proxy_request",
        description: "Execute a secure HTTP request on behalf of the AI. Supports GET, POST, PUT, DELETE. Sanitizes input and masks PII in responses.",
        inputSchema: zodToMcpSchema(schemas.HttpProxyRequestSchema),
    },

];
