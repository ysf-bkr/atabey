/**
 * Core Skill Definitions for Atabey.
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
        tools: ["run_shell_command", "read_file"],
        description: "Enforces testing coverage standards, code style compliance, and runs test suites.",
        mandates: [
            "- **Zero-Mock Policy:** Integration tests must use real test database connections or service-compatible backends; do not rely on fake mocks.",
            "- **Coverage Standards:** Ensure new code meets the 80% test coverage threshold before transitioning to release phases."
        ]
    },
    DATABASE_MANAGEMENT: {
        name: "Database Management & Migrations",
        tools: ["read_file", "replace_text", "run_shell_command"],
        description: "Handles database migrations, schema design, and query optimization.",
        mandates: [
            "- **No Direct DB Calls in Controllers:** Database operations must be isolated inside repository or service files; controllers must never perform raw DB calls.",
            "- **No Raw SQL Strings:** Do not write raw SQL query strings; strictly use type-safe query builders like Kysely."
        ]
    },
    DEVOPS_INFRASTRUCTURE: {
        name: "DevOps & Infrastructure",
        tools: ["run_shell_command", "read_file"],
        description: "Manages CI/CD pipelines, container configurations, env files, and deployments.",
        mandates: [
            "- **No Hardcoded Secrets:** Never embed API keys, secrets, or passwords inside configuration files or codebases.",
            "- **Immutable Deploys:** Ensure build steps compile production bundles successfully without configuration side-effects."
        ]
    },
    SECURITY_AUDIT: {
        name: "Security Audit & Vulnerability Assessment",
        tools: ["run_shell_command", "read_file"],
        description: "Conducts AST security analysis, SSRF inspection, dependency audits, and secret scanning.",
        mandates: [
            "- **Zero-Secret Policy:** Enforce absence of hardcoded secrets or fallback API tokens.",
            "- **Least Privilege:** Ensure restricted endpoints implement RBAC and strict input validation via Zod."
        ]
    },
    FRONTEND_DEVELOPMENT: {
        name: "Frontend Architecture & Component Design",
        tools: ["read_file", "replace_text", "patch_file"],
        description: "Builds responsive, accessible, atomic UI components without direct DOM mutations.",
        mandates: [
            "- **No Direct DOM Mutation:** State changes must drive render cycles; direct DOM manipulations (`document.getElementById`) are forbidden.",
            "- **Design System Fidelity:** Follow Tailwind or defined design tokens consistently across components."
        ]
    },
    MOBILE_DEVELOPMENT: {
        name: "Mobile & Cross-Platform Development",
        tools: ["read_file", "replace_text", "patch_file", "run_shell_command"],
        description: "Architects React Native, Expo, and native bridge components with cross-platform fidelity.",
        mandates: [
            "- **Platform Separation:** Separate iOS and Android platform-specific implementations cleanly using `.ios.tsx` / `.android.tsx`.",
            "- **Responsive Ergonomics:** Support diverse screen aspect ratios, safe areas, and offline state caching."
        ]
    },
    GIT_WORKFLOW: {
        name: "Git Version Control & Branch Discipline",
        tools: ["run_shell_command", "read_file"],
        description: "Manages branches, staging, conventional commits, and atomic pull requests.",
        mandates: [
            "- **Conventional Commits:** Format all commit messages with conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`).",
            "- **Atomic Changes:** Keep commits focused on a single change with traceable commit messages."
        ]
    },
    SOCRATIC_ANALYSIS: {
        name: "Socratic Interrogation & Pre-Mortem Analysis",
        tools: ["read_file", "grep_search", "ask_human"],
        description: "Executes relentless Socratic questioning, assumption stress-testing, and compliance pre-checks against Atabey standards before implementation.",
        mandates: [
            "- **No Implementation Without Validation:** Never proceed to code implementation while requirements or edge cases remain ambiguous.",
            "- **Constitutional Verification:** Cross-examine every proposal against the 37+ standards in `.atabey/knowledge/` before Phase 1 completion."
        ]
    },
    SPECIFICATION_DESIGN: {
        name: "Formal Specification & Contract Engineering",
        tools: ["read_file", "write_file", "patch_file"],
        description: "Synthesizes Socratic grilling outputs into formal, Zod-typed, and Kysely-modeled SPEC documents.",
        mandates: [
            "- **Single Source of Truth:** Specifications must define complete user stories, Zod schemas, database models, and Gherkin acceptance criteria.",
            "- **Zero-Drift Integrity:** Public contract modifications must update type definitions and contract hashes synchronously."
        ]
    },
    DUAL_AXIS_REVIEW: {
        name: "Dual-Axis Code & Fidelity Review",
        tools: ["read_file", "grep_search", "run_shell_command"],
        description: "Audits pull requests and git diffs across two independent axes: Architecture/Smells and Specification Fidelity.",
        mandates: [
            "- **Smell & Prohibition Sweep:** Reject any code containing `any`, `console.log`, unparameterized SQL, or Martin Fowler architectural smells (god classes, feature envy).",
            "- **Strict Fidelity & Zero Scope Creep:** Reject code that alters files outside the agreed plan or fails to fulfill all Gherkin acceptance criteria."
        ]
    },
    SCIENTIFIC_DIAGNOSTICS: {
        name: "Hypothesis-Driven Scientific Bug Diagnostics",
        tools: ["read_file", "replace_text", "patch_file", "run_shell_command"],
        description: "Executes deterministic, hypothesis-driven debugging without random trial-and-error shotgun edits.",
        mandates: [
            "- **Mandatory Failing Test:** Never modify application source code until a minimal failing test reproduces the bug in `tests/`.",
            "- **Multi-Hypothesis Isolation:** Formulate at least two root-cause hypotheses and isolate the cause empirically before applying a minimal surgical fix."
        ]
    }
};
