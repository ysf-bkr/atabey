# [TOOL] Agent Atabey Skill — Quality Assurance & Testing

Enforces testing coverage standards, code style compliance, and runs test suites.

## [PLUGIN] Associated Tools
- `run_shell_command`
- `view_file`

## [SECURITY] Core Mandates
- **Zero-Mock Policy:** Integration tests must use real test database connections or service-compatible backends; do not rely on fake mocks.
- **Coverage Standards:** Ensure new code meets the 80% test coverage threshold before transitioning to release phases.
