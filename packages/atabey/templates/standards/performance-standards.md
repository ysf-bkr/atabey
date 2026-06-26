# 📈 Performance Monitoring Standards

This document defines the metrics, budgets, and monitoring requirements to ensure the Atabey AL — and the applications it produces — operate at peak efficiency.

## 1. Orchestration Core Metrics
- **Task Latency (Completion Time):** Time from task delegation (`PENDING`) to completion (`SUCCESS`) must be tracked per `Trace ID`. Target p95 < 1 orchestration loop cycle.
- **Token Consumption:** The total LLM tokens used per `Trace ID` must be logged and analyzed to identify inefficient prompts. Report any single task exceeding 2x its role budget.
- **Agent Error Rates:** The frequency of `FAILED` or `RETRY` statuses per agent must be monitored. A `@agent` exceeding a 15% retry rate over 20 tasks must be flagged for prompt review.
- **Lock Contention:** Track Hermes message-lock acquisition wait time. Sustained waits > 5s indicate orchestration contention.

## 2. Telemetry Implementation
- **Standardized Logging:** Every task completion event must include the `Trace ID`, the duration (in milliseconds), and the tool/agent interaction summary.
- **Performance Budgeting:** Each agent role has an estimated token budget. Budget overflows must be reported by the `@analyst` agent.
- **Sampling:** High-frequency tool calls (search, read) may be sampled at 10% for telemetry to avoid log flooding, but every state-mutating action is logged at 100%.

## 3. Bottleneck Identification
- **Critical Path Analysis:** Agents identified as bottlenecking the orchestration loop (frequent `WAITING` or `BLOCKED` states) must be reviewed for logic optimization.
- **Hotspot Reports:** `@analyst` produces a weekly hotspot summary identifying the top 3 slowest agents and the top 3 most token-expensive task types.

## 4. Application Runtime Performance (Delivered Product)
The applications the AL builds must also meet runtime budgets:
- **Web Vitals:** LCP < 2.5s, INP < 200ms, CLS < 0.1 on the 75th percentile of real users.
- **API Latency:** Server p95 response time < 300ms for read endpoints, < 800ms for write endpoints under nominal load.
- **Database:** No N+1 query patterns. Every list endpoint must be paginated; queries on non-indexed columns in hot paths are forbidden.
- **Bundle Budget:** Initial JS payload (gzipped) < 200KB for the critical route; enforce code-splitting for routes beyond the entry shell.
- **Caching:** Cacheable responses must declare explicit `Cache-Control`; server-side data fetching uses a documented TTL strategy.

## 5. Regression Gate
- Performance budgets are enforced in CI. A change that regresses a tracked metric beyond its threshold blocks merge until `@manager` approves an explicit exception with a `Trace ID`.
