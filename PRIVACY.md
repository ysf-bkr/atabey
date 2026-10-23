# Privacy & Compliance — Atabey

## KVKK & GDPR Technical Controls

Atabey is designed with **Privacy by Design** and **Privacy by Default** principles and
provides technical controls intended to assist with:

- **KVKK** (Turkish Personal Data Protection Law No. 6698) — Articles 4, 5, 7, 11, 12
- **GDPR** (EU General Data Protection Regulation) — Articles 5, 17, 32

> These controls are technical enablers, **not a legal compliance declaration or
> certification**. Whether a deployment is compliant depends on how it is configured and
> used; assess that with your DPO or legal counsel.

---

## 📋 Data Inventory

| Data Type | Collected | Storage | Retention (actual) | Purpose |
|-----------|-----------|---------|--------------------|---------|
| **Chat messages** | ✅ | SQLite (`messages`) | 30 days (automatic cleanup) | Agent communication (Hermes) |
| **Audit logs** | ✅ | SQLite (`audit_log`) | 30 days by default; up to **90 days** max (see below) | Governance & traceability |
| **Agent execution logs** | ✅ | SQLite (`logs`) | 30 days (automatic cleanup) | Performance monitoring |
| **Task plans** | ✅ | SQLite (`tasks`) | Until erased (no automatic expiry) | Task orchestration |
| **Token cost rows** | ✅ | SQLite (`costs`) | Until erased (no automatic expiry) | Usage accounting |
| **HITL approvals** | ✅ | SQLite (`approvals`) | Until erased (no automatic expiry) | Human approval records |
| **Project memory** | ✅ | SQLite + `.md` | Project lifetime | Agent context |
| **Vector embeddings** | ✅ | SQLite | Project lifetime | Semantic search |
| **API keys** | ❌ Not collected by telemetry | Env vars, or the local encrypted vault (`atabey secrets`, AES-256-GCM) | Until rotated/deleted | Provider auth |
| **User credentials** | ❌ Not collected by telemetry | Local `.atabey` auth store | Until revoked | Local MCP access control |
| **Personal data (PII)** | ⚠️ Masked only on Atabey channels | Not stored by Atabey when masking matches | N/A | Redaction before logs/audit/tool output |

---

## 🛡️ Built-in Compliance Features

### 1. PII Masking (KVKK Art. 12 / GDPR Art. 32)

Log entries written through Atabey's logger and audit records created by Atabey are scanned
for Personally Identifiable Information **before** they are persisted. Data that never passes
through Atabey (for example, files written by host-native tools) is outside this scope:

```typescript
// Automatic masking on every log entry
logger.info("User email: user@example.com");
// Output: [INFO] User email: ***@***

// Automatic masking on audit records
audit.log({ details: { phone: "+90 555 123 4567" } });
// Stored: { phone: "***-***-****" }
```

**Masked patterns** (actual replacements produced by `pii.ts`):
| Pattern | Example | Masked |
|---------|---------|--------|
| Email | `user@example.com` | `***@***` |
| Phone (TR) | `+90 555 123 4567` | `***-***-****` |
| TC Kimlik | `10000000146` (checksum-valid) | `***********` |
| Credit Card | `4532 1234 5678 1234` | `****-****-****-****` |
| IP Address | `192.168.1.1` | `***.***.***.***` |
| API Keys | `sk-abc...` | `***-REDACTED-***` |
| JWT Tokens | `eyJ...` | `***-JWT-REDACTED-***` |
| IBAN | `TR33...` | `****-IBAN-REDACTED-****` |
| Passwords | `"password": "123"` | `"password": "***-REDACTED-***"` |

### 2. Data Retention (KVKK Art. 5 / GDPR Art. 5)

Cleanup runs hourly and deletes **audit rows, messages and execution logs** whose retention
window has elapsed. Tasks, cost rows and approval records are **not** expired automatically;
they are removed by trace-level or full erasure (section 3), or by deleting `.atabey/`.

| Data | Effective retention |
|------|---------------------|
| Messages | 30 days |
| Execution logs | 30 days |
| Audit records | 30 days default, configurable, hard cap **90 days** |
| Tasks, costs, approvals | No automatic expiry — erase explicitly |

```bash
# Audit retention (default 30 days). Values above 90 are clamped to 90.
export ATABEY_DATA_RETENTION_DAYS=60
```

> `RETENTION_POLICIES` in `retention.ts` lists longer reference targets per data category for
> reporting. Those targets are **not** applied by the audit writer: audit rows are clamped to
> `MAX_RETENTION_DAYS` (90), so 180/365/730-day retention is not available today. Treat the
> following as a target catalogue, not a guarantee:
>
> | Category | Reference target | Applied automatically? |
> |----------|------------------|------------------------|
> | OPERATIONAL | 30 days | ✅ messages & logs |
> | USER_DATA | 90 days | ⚠️ audit default only |
> | API_CALL | 180 days | ❌ not enforced |
> | SECURITY | 365 days | ❌ not enforced |
> | COMPLIANCE | 730 days | ❌ not enforced |

### 3. Right to Erasure (KVKK Art. 7 / GDPR Art. 17)

Users can request deletion of all data associated with a Trace ID, via the CLI
or the `DataRetention` service:

```bash
# Erase a single trace (audit log, messages, tasks, logs, costs, approvals)
atabey audit erase T-042

# Full right-to-erasure across every table (requires confirmation code)
atabey audit erase --all --confirm KVKK-RIGHT-TO-ERASURE
```

Via the library:
```typescript
import { DataRetention } from "./shared/retention.js";

// Delete trace data (audit_log, messages, tasks, logs, costs, approvals)
DataRetention.eraseTraceData("T-abc123");

// Delete ALL data (requires confirmation code) across every table
DataRetention.eraseAllData("KVKK-RIGHT-TO-ERASURE");
```

> The append-only audit chain uses **HMAC-SHA256 with a key stored outside the
> database** (`.atabey/audit-hmac.key`, or `ATABEY_AUDIT_HMAC_KEY`), plus an
> out-of-DB tip anchor to detect tail truncation. Legitimate erasure refreshes
> the anchor so removal is distinguishable from tampering.

### 3b. Third-Party Transfer: Optional OpenAI Embeddings

Atabey is local by default, with one deliberate exception:

- If `OPENAI_API_KEY` is set (environment or a `.env` file in the project root), **the text
  being embedded is sent to `https://api.openai.com/v1/embeddings`** (`text-embedding-3-small`).
  This applies to indexing and to search queries.
- Without a key, no embedding request leaves the machine; Atabey uses the local TF-IDF
  vectorizer instead.
- To keep everything local: do not set `OPENAI_API_KEY`. Existing entries created with OpenAI
  vectors are not comparable with local ones, so re-index (`atabey index`) after switching.

If you operate under KVKK/GDPR, evaluate this transfer (processor relationship, data location,
retention at the provider) before enabling the key.

### 4. Data Portability (KVKK Art. 11 / GDPR Art. 20)

All stored operational data and metrics are inspectable:

```bash
# View agent statuses, token usage, and cost distributions
atabey status

# Run full health and compliance checks
atabey check
```

### 5. Data Processing Records (KVKK Art. 4 / GDPR Art. 30)

Operations recorded by Atabey's logger and audit trail include:
- **What** data was processed
- **Who** processed it (which agent)
- **When** it was processed (timestamp)
- **Why** it was processed (trace ID)
- **Retention** period applied

---

## 🔒 Security Measures

| Measure | KVKK | GDPR | Implementation |
|---------|------|------|----------------|
| Pseudonymization | Art. 5 | Art. 32 | PII masking |
| Encryption in transit | Art. 12 | Art. 32 | TLS 1.3 (+ mTLS) for HTTP/SSE/WebSocket |
| Encryption at rest | Art. 12 | Art. 32 | SQLite file permissions (no built-in encryption) |
| Access control | Art. 12 | Art. 32 | Optional auth + passcode gate for high-risk approvals |
| Incident response | Art. 12 | Art. 33 | Hermes alert system |
| Data breach notification | Art. 12 | Art. 34 | Audit log + logger |

---

## 📝 CLI Commands

```bash
# View agent status, token usage, and cost distribution
atabey status

# Run compliance, health, and security checks
atabey check
```

---

## 📚 References

- **KVKK Law No. 6698:** [kvkk.gov.tr](https://www.kvkk.gov.tr)
- **GDPR:** [gdpr.eu](https://gdpr.eu)
- **KVKK Art. 5:** Data processing conditions
- **KVKK Art. 7:** Right to erasure
- **KVKK Art. 11:** Data subject rights
- **KVKK Art. 12:** Data security obligations
- **GDPR Art. 5:** Principles of processing
- **GDPR Art. 17:** Right to erasure
- **GDPR Art. 32:** Security of processing

---

*Last updated: 23.10.2026 — v0.1.7*
