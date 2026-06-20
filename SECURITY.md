# Security Policy — Agent Atabey

---

## Supported Versions

| Version | Support Status |
|---------|----------------|
| 0.0.x (latest) | ✅ Active security updates |
| < 0.0.8 | ❌ Not supported |

---

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public issue**. Instead:

1. **Email:** ybekar@msn.com
2. **Subject:** `[SECURITY] Agent Atabey - Brief Description`
3. **Content:**
   - Vulnerability type (XSS, Injection, Privilege Escalation, etc.)
   - Affected versions
   - Reproduction steps
   - Potential impact
   - Suggested fix (if any)

### Expected Response Time

- **Initial response:** Within 48 hours
- **Fix:** Critical vulnerabilities within 7 days
- **Low priority:** Next release

---

## Built-in Security Measures

### Zero Type Hole

The framework **strictly forbids** the `any` type. All runtime inputs are validated with Zod schemas.

```typescript
// ✅ Safe - Zod validated
const WriteFileSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
    force: z.boolean().optional(),
});

// ❌ Unsafe - typed any
function writeFile(path: any, content: any) { }
```

### PII Masking (KVKK Compliant)

All logs are scanned for Personally Identifiable Information (PII) and sensitive data is automatically masked:

- **Email:** `user@example.com` → `[EMAIL]`
- **Phone:** `+90 555 123 4567` → `[PHONE]`
- **Turkish ID:** `12345678901` → `[TCKN]`
- **Credit Card:** `4532-....-....-1234` → `[CC]`
- **IP Address:** `192.168.1.1` → `[IP]`

```typescript
import { maskObject, maskText, containsPII } from "./shared/pii.js";

// Automatic masking
logger.info("User login: user@example.com");
// Output: [PID:12345] [INFO]: User login: [EMAIL]
```

### Hermes Lock Protocol

Race conditions are prevented using a file-based lock mechanism:

```typescript
import { acquireLock, releaseLock } from "./shared/lock.js";

// Acquire lock
const lock = await acquireLock("resource-name");
if (!lock) {
    throw new Error("Resource locked");
}

try {
    // Critical operation
} finally {
    // Release lock
    await releaseLock("resource-name");
}
```

### Human-in-the-Loop

Operations with a risk score ≥ 60 require human approval:

- SQL commands like `DROP TABLE`, `DELETE FROM`, `TRUNCATE`
- Secret/environment variable manipulation
- File deletion/overwrite
- Project configuration changes

```bash
# Approval process
atabey approve T-042
```

### Audit Logging

All agent actions are stored in SQLite-based audit logs:

```typescript
import { audit } from "./shared/audit.js";

audit.log({
    action: "FILE_WRITE",
    agent: "@backend",
    target: "apps/backend/src/auth.ts",
    traceId: "T-abc123",
    status: "SUCCESS",
});
```

---

## Vulnerability Categories

### 1. Prompt Injection

Prompt injection attacks targeting AI agents:

- **Risk:** High
- **Protection:** Input sanitization, role-based access controls
- **Prevention:** User input is never directly concatenated into agent system prompts

### 2. Path Traversal

Path traversal through file system tools:

- **Risk:** High
- **Protection:** All file paths are restricted to the project directory
- **Prevention:** Path validation via Zod schemas

```typescript
const pathSchema = z.string().refine(
    (p) => !p.includes("..") && !p.startsWith("/"),
    "Path traversal detected"
);
```

### 3. SQL Injection

Injection attacks through SQLite queries:

- **Risk:** Medium
- **Protection:** All queries use prepared statements
- **Prevention:** `better-sqlite3` parameterized queries

### 4. Secret Exposure

- **Risk:** High
- **Protection:** Only `.env.example` is stored in git; `.env` files are excluded
- **Prevention:** Secret scanning via `security:audit` command

```bash
# Scan project for secrets/credentials
npx atabey security:audit
```

### 5. MCP Tool Abuse

Abuse of MCP tools:

- **Risk:** Medium
- **Protection:** All tool calls are validated with Zod schemas
- **Prevention:** ATABEY.md Rule 4

---

## Best Practices for Secure Usage

### 1. Project Directory Security

```bash
# Never commit .env files
echo ".env" >> .gitignore
echo ".atabey/*" >> .gitignore  # Framework internal state

# Store sensitive information as environment variables
export ATABEY_API_KEY="your-key-here"
```

### 2. MCP Configuration

```json
{
    "mcpServers": {
        "atabey": {
            "command": "npx",
            "args": ["atabey-mcp"],
            "env": {
                "ATABEY_PROJECT_ROOT": "/path/to/project"
            }
        }
    }
}
```

### 3. Regular Audits

```bash
# Weekly security audit
npx atabey check
npx atabey security:audit
npx atabey check:lint
```

### 4. Dependency Audits

```bash
# Keep dependencies updated regularly
npm audit
npx atabey mcp check  # MCP dependencies
```

---

## Security Incident Response Plan

### Level 1: Low (Informational)
- Automatic reporting
- Fixed in next release

### Level 2: Medium (Limited Impact)
- Patch within 48 hours
- Notification to users

### Level 3: High (Critical)
- Immediate response
- Emergency patch release
- Urgent notification to all users
- Temporary workaround recommendations

### Level 4: Critical (Data Breach)
- Immediate response
- System isolation
- Forensic investigation
- Legal notifications
- Public disclosure

---

## Responsible Disclosure

We thank security researchers:

- *No external reports have been received yet.*

If you discover a security vulnerability and wish to disclose it responsibly, please use the contact information above.

---

## License

This security policy is licensed under the [MIT License](LICENSE).

*Last updated: 19.06.2026*
