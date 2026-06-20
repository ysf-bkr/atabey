# Privacy & Compliance — Agent Atabey

## KVKK & GDPR Compliance Declaration

Agent Atabey is designed with **Privacy by Design** and **Privacy by Default** principles, compliant with:

- **KVKK** (Turkish Personal Data Protection Law No. 6698) — Articles 4, 5, 7, 11, 12
- **GDPR** (EU General Data Protection Regulation) — Articles 5, 17, 32

---

## 📋 Data Inventory

| Data Type | Collected | Storage | Retention | Purpose |
|-----------|-----------|---------|-----------|---------|
| **Chat messages** | ✅ | SQLite (`messages`) | 30 days | Agent communication (Hermes) |
| **Audit logs** | ✅ | SQLite (`audit_log`) | 30-90 days | Governance & traceability |
| **Agent execution logs** | ✅ | SQLite (`logs`) | 30 days | Performance monitoring |
| **Task plans** | ✅ | SQLite (`tasks`) | 30 days | Task orchestration |
| **Project memory** | ✅ | SQLite + `.md` | Project lifetime | Agent context |
| **Vector embeddings** | ✅ | SQLite | Project lifetime | Semantic search |
| **API keys** | ❌ Never stored | Env variables only | N/A | N/A |
| **User credentials** | ❌ Never stored | N/A | N/A | N/A |
| **Personal data (PII)** | ❌ Automatically masked | N/A | N/A | N/A |

---

## 🛡️ Built-in Compliance Features

### 1. PII Masking (KVKK Art. 12 / GDPR Art. 32)

All logs and audit records are automatically scanned for Personally Identifiable Information:

```typescript
// Automatic masking on every log entry
logger.info("User email: user@example.com");
// Output: [INFO] User email: [EMAIL]

// Automatic masking on audit records
audit.log({ details: { phone: "+90 555 123 4567" } });
// Stored: { phone: "[PHONE]" }
```

**Masked patterns:**
| Pattern | Example | Masked |
|---------|---------|--------|
| Email | `user@example.com` | `[EMAIL]` |
| Phone (TR) | `+90 555 123 4567` | `[PHONE]` |
| TC Kimlik | `12345678901` | `[TCKN]` |
| Credit Card | `4532 1234 5678 1234` | `[CC]` |
| IP Address | `192.168.1.1` | `[IP]` |
| API Keys | `sk-abc...` | `[REDACTED]` |
| JWT Tokens | `eyJ...` | `[REDACTED]` |
| Passwords | `"password": "123"` | `"password": "***"` |

### 2. Data Retention (KVKK Art. 5 / GDPR Art. 5)

| Category | Retention | Justification |
|----------|-----------|---------------|
| OPERATIONAL | 30 days | KVKK Art. 5 — Limited purpose |
| USER_DATA | 90 days | KVKK Art. 5 — Contract fulfillment |
| API_CALL | 180 days | KVKK Art. 5 — Legal obligation |
| SECURITY | 365 days | KVKK Art. 5 — Security audit |
| COMPLIANCE | 730 days | KVKK Art. 5 — Regulatory compliance |

Automatic cleanup runs every hour. Configure via environment:
```bash
export ATABEY_DATA_RETENTION_DAYS=60  # Override default (30)
```

### 3. Right to Erasure (KVKK Art. 7 / GDPR Art. 17)

Users can request deletion of all data associated with a Trace ID:

```bash
# Delete all data for a specific trace
npx atabey approve T-042

# Complete data erasure (admin only)
atabey kvkk:erase-all
```

Via API:
```typescript
import { DataRetention } from "./shared/retention.js";

// Delete trace data
DataRetention.eraseTraceData("T-abc123");

// Delete ALL data (requires confirmation code)
DataRetention.eraseAllData("KVKK-RIGHT-TO-ERASURE");
```

### 4. Data Portability (KVKK Art. 11 / GDPR Art. 20)

All stored data is exportable:

```bash
# Export audit logs
atabey gateway stats

# Export all data
atabey kvkk:export
```

### 5. Data Processing Records (KVKK Art. 4 / GDPR Art. 30)

Every data processing operation is logged in the audit trail:
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
| Encryption at rest | Art. 12 | Art. 32 | SQLite file permissions |
| Access control | Art. 12 | Art. 32 | File-based locking |
| Incident response | Art. 12 | Art. 33 | Hermes alert system |
| Data breach notification | Art. 12 | Art. 34 | Audit log + logger |

---

## 📝 CLI Commands

```bash
# Check current retention status
atabey kvkk:status

# Export data inventory
atabey kvkk:export

# Erase all data (with confirmation)
atabey kvkk:erase-all

# Run compliance audit
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

*Last updated: 19.06.2026*
