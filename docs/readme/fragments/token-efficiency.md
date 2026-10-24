## Token Efficiency

Atabey keeps token consumption low at three layers — **there is no monetary budget layer**:

1. **Measurement** — every tool call is counted with the real `cl100k_base` BPE tokenizer (input/output split).
2. **Limits** — per-provider context / response / per-minute / per-hour and tool-call rate ceilings (`context-optimizer.ts`). A breach sets a cooldown; hard blocking is opt-in via `ATABEY_TOKEN_BUDGET_ENFORCE=true`.
3. **Savings** — `read_file` responses are smart-truncated (imports/types/signatures preserved), `http_proxy` caches + strips HTML, loop detection stops token-burning loops, and `get_task_context` / `get_symbol_outline` / `get_api_catalog` feed the AI pre-indexed context instead of forcing full-repo scans.

### Silent routing overhead (on by default)

Unless told otherwise, Atabey prepends the routed agent's instructions to **every tool
response** (`silent-router.ts`). Measured on v0.1.7 that preamble is ~1.6–2.7 KB per call
(≈400–700 tokens), so a 40-call session adds roughly 20 K prompt tokens.

Disable or trim it when the host already carries the role instructions:

```bash
export MCP_SILENT_ROUTING=false          # no injection at all
export MCP_INJECT_SPECIALTY_MEMORY=false # keep the role prompt, drop specialty memory
export MCP_SILENT_STEALTH=false          # silence the stderr "routed to @x" notices
```

Tune limits with `MCP_MAX_TOKENS_PER_MINUTE`, `MCP_MAX_TOKENS_PER_HOUR`, `MCP_MAX_CONTEXT_TOKENS`, `MCP_MAX_FILE_READ_SIZE`.
