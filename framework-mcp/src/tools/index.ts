import { z } from "zod";
import { handleMaskPII } from "./compliance/mask_pii.js";
import { handleAcquireLock, handleReleaseLock } from "./control_plane/locking.js";
import { handleRegisterAgent } from "./control_plane/registry.js";
import { TOOLS } from "./definitions.js";
import { handleBatchSurgicalEdit } from "./file_system/batch_surgical_edit.js";
import { handlePatchFile } from "./file_system/patch_file.js";
import { handleReadFile } from "./file_system/read_file.js";
import { handleReplaceText } from "./file_system/replace_text.js";
import { handleWriteFile } from "./file_system/write_file.js";
import { handleAuditDependencies } from "./framework/audit_deps.js";
import { handleGetFrameworkStatus } from "./framework/get_status.js";
import { handleOrchestrateLoop } from "./framework/orchestrate.js";
import { handleRunTests } from "./framework/run_tests.js";
import { handleSubmitPlan } from "./framework/submit_plan.js";
import { handleUpdateContractHash } from "./framework/update_contract_hash.js";
import { handleUpdateProjectMemory } from "./framework/update_memory.js";
import { handleDeleteKnowledge } from "./memory/delete_knowledge.js";
import { handleGetMemoryInsights } from "./memory/get_insights.js";
import { handleReadProjectMemory } from "./memory/read_memory.js";
import { handleSearchKnowledge } from "./memory/search_knowledge.js";
import { handleStoreKnowledge } from "./memory/store_knowledge.js";
import { handleAskHuman } from "./messaging/ask_human.js";
import { handleApproveOperation } from "./messaging/approve_operation.js";
import { handleLogAgentAction } from "./messaging/log_action.js";
import { handleSendAgentMessage } from "./messaging/send_message.js";
import { handleCheckPorts } from "./observability/check_ports.js";
import { handleGetSystemHealth } from "./observability/get_health.js";
import { handleAnalyzeCodeQuality } from "./quality/analyze_code_quality.js";
import { handleCheckArchitectureCompliance } from "./quality/check_architecture_compliance.js";
import { handleCheckLint } from "./quality/check_lint.js";
import * as schemas from "./schemas.js";
import { handleGetProjectGaps } from "./search/get_gaps.js";
import { handleGetProjectMap } from "./search/get_map.js";
import { handleGrepSearch } from "./search/grep_search.js";
import { handleListDir } from "./search/list_dir.js";
import { handleRunCommand } from "./shell/run_command.js";
import { ToolHandler, ToolResult } from "./types.js";

// Map of tool names to their handler functions
const bind = <T>(fn: (root: string, args: T) => ToolResult | Promise<ToolResult>): ToolHandler => {
    return (root: string, args: unknown) => fn(root, args as T);
};

export const toolHandlers: Record<string, ToolHandler> = {
    read_file: bind(handleReadFile),
    view_file: bind(handleReadFile), // Alias
    list_dir: bind(handleListDir),
    grep_search: bind(handleGrepSearch),
    get_project_map: bind(handleGetProjectMap),
    get_project_gaps: bind(handleGetProjectGaps),
    write_file: bind(handleWriteFile),
    replace_text: bind(handleReplaceText),
    batch_surgical_edit: bind(handleBatchSurgicalEdit),
    patch_file: bind(handlePatchFile),
    get_framework_status: bind(handleGetFrameworkStatus),
    read_project_memory: bind(handleReadProjectMemory),
    get_memory_insights: bind(handleGetMemoryInsights),
    store_knowledge: bind(handleStoreKnowledge),
    search_knowledge: bind(handleSearchKnowledge),
    delete_knowledge: bind(handleDeleteKnowledge),
    update_project_memory: bind(handleUpdateProjectMemory),
    audit_dependencies: bind(handleAuditDependencies),
    run_tests: bind(handleRunTests),
    get_system_health: bind(handleGetSystemHealth),
    check_active_ports: bind(handleCheckPorts),
    orchestrate_loop: bind(handleOrchestrateLoop),
    submit_plan: bind(handleSubmitPlan),
    send_agent_message: bind(handleSendAgentMessage),
    log_agent_action: bind(handleLogAgentAction),
    ask_human: bind(handleAskHuman),
    approve_operation: bind(handleApproveOperation),
    update_contract_hash: bind(handleUpdateContractHash),
    acquire_lock: bind(handleAcquireLock),
    release_lock: bind(handleReleaseLock),
    register_agent: bind(handleRegisterAgent),
    run_shell_command: bind(handleRunCommand),
    check_lint: bind(handleCheckLint),
    analyze_code_quality: bind(handleAnalyzeCodeQuality),
    check_architecture_compliance: bind(handleCheckArchitectureCompliance),
    mask_pii: bind(handleMaskPII),
};

// Map of tool names to their Zod validation schemas
export const toolSchemas: Record<string, z.ZodType> = {
    // File System
    read_file: schemas.ReadFileSchema,
    view_file: schemas.ReadFileSchema,
    write_file: schemas.WriteFileSchema,
    replace_text: schemas.ReplaceTextSchema,
    batch_surgical_edit: schemas.BatchSurgicalEditSchema,
    patch_file: schemas.PatchFileSchema,

    // Search & Exploration
    list_dir: schemas.ListDirSchema,
    grep_search: schemas.GrepSearchSchema,
    get_project_map: schemas.GetProjectMapSchema,
    get_project_gaps: schemas.GetProjectGapsSchema,

    // Framework & System
    run_shell_command: schemas.RunShellCommandSchema,
    run_tests: schemas.RunTestsSchema,
    get_system_health: schemas.GetSystemHealthSchema,
    check_active_ports: schemas.CheckPortsSchema,
    get_framework_status: schemas.GetFrameworkStatusSchema,
    read_project_memory: schemas.ReadProjectMemorySchema,
    get_memory_insights: schemas.GetMemoryInsightsSchema,
    store_knowledge: schemas.StoreKnowledgeSchema,
    search_knowledge: schemas.SearchKnowledgeSchema,
    delete_knowledge: schemas.DeleteKnowledgeSchema,
    update_project_memory: schemas.UpdateProjectMemorySchema,
    orchestrate_loop: schemas.OrchestrateLoopSchema,
    submit_plan: schemas.SubmitPlanSchema,
    update_contract_hash: schemas.UpdateContractHashSchema,
    audit_dependencies: schemas.AuditDependenciesSchema,
    check_lint: schemas.CheckLintSchema,

    // Control Plane
    acquire_lock: schemas.AcquireLockSchema,
    release_lock: schemas.ReleaseLockSchema,
    register_agent: schemas.RegisterAgentSchema,

    // Messaging (Hermes)
    send_agent_message: schemas.SendAgentMessageSchema,
    log_agent_action: schemas.LogAgentActionSchema,
    ask_human: schemas.AskHumanSchema,
    approve_operation: schemas.ApproveOperationSchema,

    // Code Quality
    analyze_code_quality: schemas.AnalyzeCodeQualitySchema,
    check_architecture_compliance: schemas.CheckArchitectureComplianceSchema,

    // PII / Compliance
    mask_pii: schemas.MaskPIISchema,
};

export { TOOLS };
