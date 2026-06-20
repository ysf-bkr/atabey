# [SECURITY] Security Audit Standards

This document defines the security audit procedures required for all Agent Atabey-managed projects to ensure a "Defense-in-Depth" posture, aligned with OWASP ASVS and the OWASP Top 10.

## 1. Automated Vulnerability Scanning
- **Dependency Audit:** All projects must execute `npm audit` within the CI/CD pipeline. Any high/critical vulnerability must block deployment.
- **Static Analysis (SAST):** Use `eslint-plugin-security` to detect potential vulnerabilities (e.g., insecure crypto, command injection risks) in the codebase.
- **Secret Scanning:** Run a secret scanner (e.g., gitleaks) on every commit; a detected secret blocks the pipeline and triggers rotation.
- **SCA & SBOM:** Maintain a Software Bill of Materials. Pin dependency versions with a committed lockfile; forbid floating ranges in production manifests.

## 2. Agent Governance (Prompt Security)
- **Prompt Sanitization:** All user-provided inputs must pass through `src/cli/utils/string.ts` sanitizers before being injected into system prompts.
- **Tool Allowlist:** Agents must only have access to a strictly defined, minimal toolset required for their role.
- **Approval Flow:** Any agent requesting an action that modifies persistent state (File write, DB mutation) must be routed through the `@manager` approval gate.
- **Path Confinement:** File-system tools must reject path traversal (`..`) and operate only within the project root (`safePath` enforcement).

## 3. Application Security Review (OWASP Top 10)
Every audit must explicitly verify:
- **Access Control (A01):** Authorization checked server-side on every protected resource; no reliance on client-side hiding. RLS enforced at the database tier.
- **Injection (A03):** Parameterized/type-safe queries only (Kysely); no string-concatenated SQL or shell.
- **Insecure Design (A04):** Threat model documented for new high-risk features before implementation.
- **Auth Failures (A07):** Strong password/credential policy, session expiry, brute-force rate limiting, secure cookie flags.
- **SSRF (A10):** Outbound requests to user-controlled URLs are validated against an allowlist.

## 4. Secret Management
- **Environment Isolation:** No secrets in code. Use `.env` files exclusively.
- **CI/CD Secrets:** Production secrets must be managed via GitHub Secrets/Action Variables, never committed to the repository.
- **Rotation:** Secrets have a documented rotation policy; a leaked secret is rotated immediately and the incident logged in the audit trail.

## 5. Audit Cadence and Reporting
- **Frequency:** Automated scans run on every PR; a full manual review by `@security` is required before any release tagged `vX.Y.0` and after any high-risk change.
- **Findings Ledger:** Every finding is recorded with severity (Critical/High/Medium/Low), a `Trace ID`, owner, and remediation status. Critical/High findings block release.
- **Penetration Testing:** High-risk surfaces (auth, billing, PII export) receive a focused pen-test before going to production.
