# [TOOL] Agent Atabey Skill — Hermes Orchestration & Messaging

Governs inter-agent message passing, task delegation, and execution logs using the Hermes Message Broker.

## [PLUGIN] Associated Tools
- `orchestrate_loop`
- `send_agent_message`
- `get_framework_status`
- `log_agent_action`

## [SECURITY] Core Mandates
- **Traceability:** Always include the active `traceId` in all messages and action logs.
- **Action Logs:** Log critical operations with `log_agent_action` to ensure transparency and accountability.
- **Message Loops:** Run `orchestrate_loop` to process queued messages and trigger state transitions.
