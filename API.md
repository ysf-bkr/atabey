# [ATABEY] Model Context Protocol (MCP) API Reference

This document provides a detailed reference for all the Model Context Protocol (MCP) tools registered by the **Agent Atabey** framework. These tools are exposed to connected AI models (such as Cursor, Claude Code, or Gemini CLI) to orchestrate agents, manage codebase state, analyze quality, and interact with the local development environment.

---

## 📋 Table of Contents
1. [File System Tools](#1-file-system-tools)
2. [Search & Exploration Tools](#2-search--exploration-tools)
3. [Framework & System Tools](#3-framework--system-tools)
4. [Memory (Core Memory) Tools](#4-memory-core-memory-tools)
5. [Control Plane Tools](#5-control-plane-tools)
6. [Messaging (Hermes) Tools](#6-messaging-hermes-tools)
7. [Code Quality & Compliance Tools](#7-code-quality--compliance-tools)

---

## 1. File System Tools

### `read_file` (Alias: `view_file`)
Read the content of a file within the project. Supports optional line range reading to prevent context window overload.

**Parameters:**
*   `path` (string, required): Absolute or relative path to the file.
*   `startLine` (integer, optional): The starting line to read (1-indexed).
*   `endLine` (integer, optional): The ending line to read (1-indexed, inclusive).

---

### `write_file`
Write content to a file. Automatically creates parent directories if they do not exist.

**Parameters:**
*   `path` (string, required): Absolute or relative path to the file.
*   `content` (string, required): Full text content to write.

---

### `replace_text`
Surgically replace a string in a file with another string. Prevents rewriting the entire file for minor changes.

**Parameters:**
*   `path` (string, required): Target file path.
*   `oldText` (string, required): Exact text substring to be replaced.
*   `newText` (string, required): Replacement text.
*   `allowMultiple` (boolean, optional, default: `false`): If true, replaces all occurrences. Otherwise, errors if multiple matches are found.

---

### `batch_surgical_edit`
Perform multiple surgical text replacements across one or more files in a single atomic batch request.

**Parameters:**
*   `edits` (array of objects, required):
    *   `path` (string, required): File path to edit.
    *   `oldText` (string, required): Exact text to find.
    *   `newText` (string, required): Replacement text.
    *   `allowMultiple` (boolean, optional, default: `false`): If true, replaces all occurrences.

---

### `patch_file`
Safely update a file by replacing a specific line range with new content.

**Parameters:**
*   `path` (string, required): Target file path.
*   `startLine` (integer, required): Starting line number (1-indexed).
*   `endLine` (integer, required): Ending line number (1-indexed, inclusive).
*   `newContent` (string, required): Replacement content for the specified line range.

---

## 2. Search & Exploration Tools

### `list_dir`
List the contents of a directory.

**Parameters:**
*   `path` (string, optional, default: `.`): Directory path to list.

---

### `grep_search`
Perform a recursive regex search across the codebase.

**Parameters:**
*   `pattern` (string, required): The search regex or string.
*   `includePattern` (string, optional): Glob pattern to filter files to include (e.g. `*.ts`).
*   `excludePattern` (string, optional): Glob pattern to filter files to exclude.

---

### `get_project_map`
Generate a tree-view layout of the project directories and files to understand the project structure.

**Parameters:**
*   `maxDepth` (integer, optional, default: `3`): Maximum directory depth to traverse.
*   `includeFiles` (boolean, optional, default: `true`): Whether to display files or directories only.

---

### `get_project_gaps`
Scans the codebase for TODOs, FIXMEs, and empty function bodies.

**Parameters:**
*   `path` (string, optional, default: `src`): Base directory path to scan.

---

## 3. Framework & System Tools

### `run_shell_command`
Execute an arbitrary shell command. Note: Subject to verification by Atabey's Guardian Risk Engine.

**Parameters:**
*   `command` (string, required): The command to run in the system shell.

---

### `run_tests`
Execute the project's test suites and capture pass/fail reports.

**Parameters:**
*   `command` (string, optional): Custom command to run tests (e.g. `npm run test:unit`).

---

### `get_system_health`
Retrieve real-time system metrics (CPU usage, free RAM, OS load).

**Parameters:** *None*

---

### `check_active_ports`
Identify which network ports are currently active on the host machine.

**Parameters:**
*   `filter` (string, optional): Filter results matching a specific port number or protocol.

---

### `get_framework_status`
Get the current project status including active phase, running Trace ID, and individual agent status mappings.

**Parameters:** *None*

---

### `read_project_memory`
Read the full project central memory (`PROJECT_MEMORY.md`).

**Parameters:** *None*

---

### `get_memory_insights`
Retrieve a summarized version of the project memory.

**Parameters:** *None*

---

### `update_project_memory`
Update a specific section in `PROJECT_MEMORY.md`.

**Parameters:**
*   `section` (string, required): Section header name (e.g., `STATE`, `TASKS`).
*   `content` (string, required): New markdown contents for the section.

---

### `orchestrate_loop`
Trigger a processing tick to consume pending Hermes messages and progress tasks.

**Parameters:** *None*

---

### `submit_plan`
Submit a structured Directed Acyclic Graph (DAG) plan of tasks to the framework for delegation.

**Parameters:**
*   `tasks` (array of objects, required):
    *   `id` (string, required): Task identifier following the format `TASK-001`.
    *   `agent` (string, required): Assigned agent starting with `@` (e.g. `@backend`).
    *   `task` (string, required): Human-readable task description.
    *   `dependencies` (array of strings, optional): List of Task IDs this task depends on.

---

### `update_contract_hash`
Re-generate and synchronize the backend API contract SHA-256 hash.

**Parameters:** *None*

---

### `audit_dependencies`
Audit package dependencies for unused or duplicate npm packages.

**Parameters:** *None*

---

### `check_lint`
Run the project's linter (ESLint) to identify coding violations.

**Parameters:** *None*

---

## 4. Memory (Core Memory) Tools

### `store_knowledge`
Store a new piece of project knowledge, decision, or code snippet into the vector-based core memory.

**Parameters:**
*   `content` (string, required): Knowledge details or code snippet.
*   `category` (enum, required): One of `ARCHITECTURE`, `DECISION`, `CODE_SNIPPET`, `RULE`, `TASK_HISTORY`.
*   `tags` (array of strings, optional): Custom tags for fast filtering.
*   `filePath` (string, optional): File path associated with this knowledge.
*   `traceId` (string, optional): Associated Trace ID.

---

### `search_knowledge`
Search the vector-based core memory for relevant project knowledge, past decisions, or rules using cosine similarity.

**Parameters:**
*   `query` (string, required): Search terms or natural language question.
*   `category` (enum, optional): Limit results to a specific category.
*   `limit` (integer, optional, default: `5`): Maximum number of search results to retrieve.

---

### `delete_knowledge`
Delete an obsolete or incorrect knowledge entry from the Core Memory.

**Parameters:**
*   `id` (string, optional): Specific SHA-256 hash ID of the entry to delete.
*   `category` (enum, optional): Delete all entries within a specific category.

---

## 5. Control Plane Tools

### `acquire_lock`
Acquire a stateful lock on a shared resource to prevent concurrent edits.

**Parameters:**
*   `resource` (string, required): Resource path (e.g. `src/shared/storage.ts`).
*   `agent` (string, required): Requesting agent ID (e.g. `@backend`).
*   `ttl` (integer, optional, default: `60`): Time-to-live in seconds.

---

### `release_lock`
Release a previously acquired lock on a shared resource.

**Parameters:**
*   `resource` (string, required): Resource path to unlock.
*   `agent` (string, required): Requesting agent ID.

---

### `register_agent`
Register an agent instance with the Atabey Control Plane.

**Parameters:**
*   `agent` (string, required): Agent name (e.g. `@database`).
*   `role` (string, required): Detailed role explanation.
*   `capability` (integer, optional, default: `5`): Level of autonomous execution (1-10).
*   `specialties` (object, optional): Dictionary of specialties mapped to TF-IDF weights.

---

## 6. Messaging (Hermes) Tools

### `send_agent_message`
Send a Hermes protocol message to another agent to delegate tasks or report results.

**Parameters:**
*   `from` (string, required): Sender agent ID.
*   `to` (string, required): Recipient agent ID.
*   `category` (enum, required): One of `ACTION`, `DELEGATION`, `SUBTASK`, `REPLY`, `ALERT`.
*   `content` (string, required): Message payload.
*   `traceId` (string, required): Associated Trace ID.
*   `parentId` (string, optional): Associated Parent Task ID.
*   `priority` (enum, optional, default: `NORMAL`): One of `HIGH`, `NORMAL`, `LOW`.
*   `requiresApproval` (boolean, optional, default: `false`): Block execution until human approval is received.

---

### `log_agent_action`
Log a specific agent action to the framework telemetry logs.

**Parameters:**
*   `agent` (string, required): Performing agent ID.
*   `action` (string, required): Action name.
*   `traceId` (string, required): Associated Trace ID.
*   `status` (enum, required): `SUCCESS` or `FAILURE`.
*   `summary` (string, required): Brief sentence summarizing the action.
*   `findings` (string, optional): Detailed technical results or output.

---

### `ask_human`
Pause autonomous execution and prompt the human developer a clarifying question via the terminal.

**Parameters:**
*   `question` (string, required): Clear, descriptive prompt detailing what information is required.

---

## 7. Code Quality & Compliance Tools

### `analyze_code_quality`
Analyze code quality in a given path. Runs type checks, complexity metrics, and lint rules.

**Parameters:**
*   `path` (string, required): Target directory or file path.
*   `checkTypes` (boolean, optional, default: `true`): Enable TypeScript compilation checks.
*   `checkLint` (boolean, optional, default: `true`): Enable linter checks.
*   `checkComplexity` (boolean, optional, default: `true`): Run AST checks for complexity.

---

### `check_architecture_compliance`
Check architectural boundary compliance in a given path. Verifies layer restrictions (e.g. Controllers cannot call repositories directly) and import rules.

**Parameters:**
*   `path` (string, required): Target path to verify.
*   `rules` (array of strings, optional): Custom architecture rules to enforce.
