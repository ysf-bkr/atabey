# [TOOL] Agent Atabey Skill — Surgical Code Modification

Enables surgical, precise edits to source code files without overwriting the entire content.

## [PLUGIN] Associated Tools
- `replace_text`
- `patch_file`

## [SECURITY] Core Mandates
- **Precise Selection:** Ensure `oldText` matches the target string exactly, including all whitespace and indentation.
- **Line-based Replacement:** Use `patch_file` for multi-line block updates, specifying exact 1-indexed start and end lines.
