# [SECURITY] Engineering Recipe: Advanced Security Audit

This recipe governs the @security agent's protocol for identifying and mitigating vulnerabilities within the Agent Atabey framework.

## 🏁 Phase 1: Automated Reconnaissance
1.  **Secret Scan:** Run `grep_search` for keywords: `apiKey`, `secret`, `password`, `token`, `private_key`.
2.  **SQL Injection Audit:** Scan for `raw SQL` or template literals bypassing the query builder.
3.  **Auth Check:** Verify that all sensitive routes have active `auth` guards and Role-Based Access Control (RBAC).

## [MEMORY] Phase 2: Contextual Analysis
1.  **Impact Mapping:** For every identified risk, read the surrounding code to determine if it's exposed to the public internet.
2.  **Configuration Check:** Verify `.env.example` contains all required keys and no real secrets are committed to Git.

## 🛠️ Phase 3: Surgical Mitigation
1.  **Fix:** Use `replace_text` to move hardcoded secrets to `.env` or refactor raw SQL to Kysely.
2.  **Sanitization:** Apply input validation using Zod schemas for all external data.

## [OK] Phase 4: Verification & Logging
1.  **Discipline Check:** Run `atabey check` to ensure no new violations were introduced.
2.  **Action Log:** Execute `log_agent_action` with a summary of found vs. fixed vulnerabilities.
