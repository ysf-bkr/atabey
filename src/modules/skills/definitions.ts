/**
 * Core Skill Definitions for Agent Atabey.
 * Groups tools into logical capabilities for agents.
 */

export const CORE_SKILLS = {
    FILE_SYSTEM: {
        name: "File System Mastery",
        tools: ["read_file", "write_file"],
        description: "Enables reading and writing files in the workspace with token efficiency.",
        mandates: [
            "- **Token Efficiency:** When reading large files, always specify `startLine` and `endLine` to avoid loading the entire file content into context.",
            "- **Surgical Changes:** Avoid overwriting entire files for small updates; prefer surgical edit tools."
        ]
    },
    EDITING: {
        name: "Surgical Code Modification",
        tools: ["replace_text", "patch_file"],
        description: "Enables surgical, precise edits to source code files without overwriting the entire content.",
        mandates: [
            "- **Precise Selection:** Ensure `oldText` matches the target string exactly, including all whitespace and indentation.",
            "- **Line-based Replacement:** Use `patch_file` for multi-line block updates, specifying exact 1-indexed start and end lines."
        ]
    },
    ORCHESTRATION: {
        name: "Hermes Orchestration & Messaging",
        tools: ["orchestrate_loop", "send_agent_message", "get_framework_status", "log_agent_action"],
        description: "Governs inter-agent message passing, task delegation, and execution logs using the Hermes Message Broker.",
        mandates: [
            "- **Traceability:** Always include the active `traceId` in all messages and action logs.",
            "- **Action Logs:** Log critical operations with `log_agent_action` to ensure transparency and accountability.",
            "- **Message Loops:** Run `orchestrate_loop` to process queued messages and trigger state transitions."
        ]
    },
    GOVERNANCE: {
        name: "Control Plane Governance & Locking",
        tools: ["acquire_lock", "release_lock", "register_agent", "update_contract_hash"],
        description: "Governs access control, resource locking, type contract validation, and agent registration.",
        mandates: [
            "- **Locking Protocol:** Always acquire a lock via `acquire_lock` on shared resources (like memory files) before editing, and release it immediately after writing.",
            "- **Contract Enforcement:** Run `update_contract_hash` to re-sync backend types and check for breaking API changes."
        ]
    },
    QUALITY_ASSURANCE: {
        name: "Quality Assurance & Testing",
        tools: ["run_shell_command", "view_file"],
        description: "Enforces testing coverage standards, code style compliance, and runs test suites.",
        mandates: [
            "- **Zero-Mock Policy:** Integration tests must use real test database connections or service-compatible backends; do not rely on fake mocks.",
            "- **Coverage Standards:** Ensure new code meets the 80% test coverage threshold before transitioning to release phases."
        ]
    },
    DATABASE_MANAGEMENT: {
        name: "Database Management & Migrations",
        tools: ["view_file", "replace_text", "run_shell_command"],
        description: "Handles database migrations, schema design, and query optimization.",
        mandates: [
            "- **No Direct DB Calls in Controllers:** Database operations must be isolated inside repository or service files; controllers must never perform raw DB calls.",
            "- **No Raw SQL Strings:** Do not write raw SQL query strings; strictly use type-safe query builders like Kysely."
        ]
    },
    DEVOPS_INFRASTRUCTURE: {
        name: "DevOps & Infrastructure",
        tools: ["run_shell_command", "view_file"],
        description: "Manages CI/CD pipelines, container configurations, env files, and deployments.",
        mandates: [
            "- **No Hardcoded Secrets:** Never embed API keys, secrets, or passwords inside configuration files or codebases.",
            "- **Immutable Deploys:** Ensure build steps compile production bundles successfully without configuration side-effects."
        ]
    }
};
