# 🪙 Token Economy & Context Management Standards

This document defines the strict context management and token cost optimization rules for Agent Atabey projects. All agents must follow these mandates to minimize LLM usage costs and prevent context drift.

## 1. Search Before Reading (Mandatory)
* **Rule:** Never execute a full directory listing (`list_dir`) recursively or read an entire file (`read_file`) without searching first.
* **Method:** Use `grep_search` to find the exact line number of interest. Then, read only the surrounding lines (e.g. ±20 lines) using `view_file` with `StartLine` and `EndLine`.
* **Cost Impact:** Prevents thousands of unnecessary input tokens from being loaded into context.

## 2. Surgical Modifications
* **Rule:** Do not write or replace whole files unless they are very small (<50 lines).
* **Method:** Use targeted text replacement tools (`replace_text`, `patch_file`, `replace_file_content`, `multi_replace_file_content`) to apply edits to specific lines only.
* **Cost Impact:** Reduces output token generation by up to 95%, keeping LLM responses fast and cost-effective.

## 3. Output Conciseness
* **Rule:** Keep explanations and logs to the absolute minimum required.
* **Method:** Do not output verbose comments, intermediate thinking logs, or redundant progress messages. Avoid repeating what the code does; explain only the "why" if non-obvious.
* **Cost Impact:** Saves output tokens in CLI streams and communication queues.

## 4. Context Compaction & Memory Pruning
* **Rule:** Do not carry the entire history of the development session.
* **Method:** Before initiating a task, retrieve only the active state via `get_memory_insights` or by reading `PROJECT_MEMORY.md`. Archive completed tasks and older logs in `.atabey/memory/archive/`.
* **Cost Impact:** Keeps the prompt context window clean and prevents performance degradation due to long-context attention dilution.

## 5. No Blind Coding & Stopping Gates
* **Rule:** Halt execution and ask the user for clarification if a task requires reading more than 5 large files without producing a clear search match.
* **Method:** Do not guess the structure or keep querying the filesystem repeatedly. Report the block to `@manager` and wait.
