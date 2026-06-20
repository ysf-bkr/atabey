# [TOOL] Agent Atabey Skill — Control Plane Governance & Locking

Governs access control, resource locking, type contract validation, and agent registration.

## [PLUGIN] Associated Tools
- `acquire_lock`
- `release_lock`
- `register_agent`
- `update_contract_hash`

## [SECURITY] Core Mandates
- **Locking Protocol:** Always acquire a lock via `acquire_lock` on shared resources (like memory files) before editing, and release it immediately after writing.
- **Contract Enforcement:** Run `update_contract_hash` to re-sync backend types and check for breaking API changes.
