# [TOOL] Agent Atabey Skill — File System Mastery

Enables reading and writing files in the workspace with token efficiency.

## [PLUGIN] Associated Tools
- `read_file`
- `write_file`

## [SECURITY] Core Mandates
- **Token Efficiency:** When reading large files, always specify `startLine` and `endLine` to avoid loading the entire file content into context.
- **Surgical Changes:** Avoid overwriting entire files for small updates; prefer surgical edit tools.
