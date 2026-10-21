## Security & Compliance

### Rule-based, fail-closed governance
- AST-based compliance scanning + strict TypeScript (**`any` is forbidden**, no `console.*` in production code)
- **Fail-closed PolicyGate** + deny-by-default RBAC permission matrix (protected paths: `.env*`, `.git/`, `.ssh/`, `.atabey/*`, keys)
- **Prompt-injection mitigation** (OWASP LLM01 aligned) on both input and tool response
- **Secret-leak redaction** on tool output + AES-256-GCM local secret vault
- **HMAC-SHA256** tamper-evident audit chain
- SSRF-guarded HTTP proxy + Host header DNS-rebinding protection on localhost
- **TLS 1.3 + optional mTLS** on the unified HTTP/SSE transport
- Human-in-the-Loop: risk score ≥ 60 requires human approval

### KVKK / GDPR technical alignment

| Feature | KVKK | GDPR | Status |
|---------|------|------|--------|
| PII Masking (20+ patterns, checksum-validated TCKN) | Art. 4, 5, 12 | Art. 5, 32 | ✅ |
| Data Retention (30–730 days, by category) | Art. 5, 7 | Art. 5, 17 | ✅ |
| Right to Erasure (`atabey audit erase`) | Art. 7 | Art. 17 | ✅ |
| Audit Trail (tamper-evident log chain) | Art. 12 | Art. 30 | ✅ |
| Data Classification | Art. 6 | Art. 9 | ✅ |

> Technical compliance tooling — not legal certification. Pair with your DPO / counsel.
