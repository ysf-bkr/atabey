## Token Efficiency

Atabey keeps token consumption low at three layers — **there is no monetary budget layer**:

1. **Measurement** — every tool call is counted with the real `cl100k_base` BPE tokenizer (input/output split).
2. **Limits** — per-provider context / response / per-minute / per-hour and tool-call rate ceilings (`context-optimizer.ts`). A breach sets a cooldown; hard blocking is opt-in via `ATABEY_TOKEN_BUDGET_ENFORCE=true`.
3. **Savings** — `read_file` responses are smart-truncated (imports/types/signatures preserved), `http_proxy` caches + strips HTML, loop detection stops token-burning loops, and `get_task_context` / `get_symbol_outline` / `get_api_catalog` feed the AI pre-indexed context instead of forcing full-repo scans.

Tune limits with `MCP_MAX_TOKENS_PER_MINUTE`, `MCP_MAX_TOKENS_PER_HOUR`, `MCP_MAX_CONTEXT_TOKENS`, `MCP_MAX_FILE_READ_SIZE`.
