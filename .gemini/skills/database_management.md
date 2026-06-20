# [TOOL] Agent Atabey Skill — Database Management & Migrations

Handles database migrations, schema design, and query optimization.

## [PLUGIN] Associated Tools
- `view_file`
- `replace_text`
- `run_shell_command`

## [SECURITY] Core Mandates
- **No Direct DB Calls in Controllers:** Database operations must be isolated inside repository or service files; controllers must never perform raw DB calls.
- **No Raw SQL Strings:** Do not write raw SQL query strings; strictly use type-safe query builders like Kysely.
