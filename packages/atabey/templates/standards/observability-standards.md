# [DATA] Observability and Monitoring Standards

This document defines the requirements for logging, tracing, metrics, and alerting within Atabey-managed projects, following the "three pillars" model (logs, metrics, traces).

## 1. Traceability
- **Trace ID Enforcement:** Every single request, message, or task delegated between agents must include the active `Trace ID` in its metadata.
- **Context Logging:** Logs must be structured in JSON format where possible, containing at least: `timestamp`, `level`, `agentName`, `traceId`, `action`, and `message`.
- **Correlation Across Boundaries:** When a task spans backend, frontend, and database work, the same `Trace ID` must propagate end-to-end so a single workflow can be reconstructed.
- **Span Discipline (App Runtime):** Production services should emit OpenTelemetry-compatible spans for inbound requests, outbound calls, and DB queries, propagating `traceparent` headers.

## 2. Audit Trail
- **High-Risk Actions:** All administrative or high-risk actions (e.g., DB changes, User role updates) must be recorded in `observability/audit_log.md` with a timestamp, actor agent, and outcome.
- **Immutable Logs:** Audit logs should be appended only and never modified or deleted.
- **Tamper Evidence:** Audit entries for compliance-sensitive actions should include the prior entry reference (chained) so deletions are detectable.

## 3. Log Levels and Hygiene
- **Level Discipline:** `ERROR` = actionable failure; `WARN` = degraded but recovered; `INFO` = lifecycle events; `DEBUG` = development only, disabled in production by default.
- **No Secrets in Logs:** PII, tokens, and credentials must never be logged. Redact with a central sanitizer before emit.
- **Cardinality Control:** Do not log unbounded high-cardinality values (raw user input, full payloads) at `INFO`.

## 4. Metrics (RED / USE)
- **RED for services:** Track Rate, Errors, and Duration for every endpoint.
- **USE for resources:** Track Utilization, Saturation, and Errors for CPU, memory, and connection pools.
- **SLOs:** Each critical service declares an SLO (e.g., 99.9% availability, p95 < 300ms) with an error budget that gates risky deploys.

## 5. Monitoring and Alerting
- **Health Checks:** Agents must periodically invoke the `get_system_health` tool; services expose a `/health` (liveness) and `/ready` (readiness) endpoint.
- **Alerting:** Critical errors or timeouts must immediately trigger an `ALERT` message to the `@manager` agent for escalation.
- **Actionable Alerts Only:** Every alert must map to a documented runbook; symptom-based alerts (SLO burn) are preferred over noisy cause-based alerts.
