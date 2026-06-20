# 🪵 Corporate Logging and Secret Management (.env) Standards

This document defines the logging discipline and sensitive data (secret) management rules for projects managed by the Agent Atabey AL.

## 1. Logging Discipline (Zero Console Policy)
- **console.log Forbidden:** The use of `console.log`, `console.warn`, or `console.error` in production code is strictly forbidden.
- **Enterprise Logger Usage:** All logging operations must be performed via the project's central logger system (`src/shared/logger.ts`).
  ```typescript
  import { logger } from "@/shared/logger";
  
  logger.info("User logged in", { userId: "..." });
  logger.error("Database connection error", { error: "..." });
  ```
- **Log Levels:**
  - `DEBUG`: Detailed technical information during development.
  - `INFO`: Normal system flow (e.g., service started, task completed).
  - `WARN`: Situations that are not errors but require attention.
  - `ERROR`: Errors that do not break system operation but require investigation.
  - `FATAL`: Critical errors that cause system crashes.

## 2. Secret Management and .env Discipline
- **Sensitive Data (Secrets):** API keys, database passwords, JWT secrets, and private keys are NEVER hardcoded into the code.
- **.env Usage:** All sensitive data and environment-specific settings are managed via the `.env` file.
- **.env.example:** An up-to-date `.env.example` file must always exist in the root directory of the project. This file should contain only the keys, not the actual values.
- **Dynamic Checks:** Agents must verify the absence of a value in the `.env` file before application runtime.

## 3. Security and PII (Personally Identifiable Information) Discipline
- **Git Ignored:** The `.env` file must always be included in `.gitignore` and never committed to the source control system.
- **Secret Masking:** Sensitive technical data such as passwords, credit card numbers, or API keys must never be written clearly in logs (they must be masked using `***` or similar).
- **PII Governance (GDPR/KVKK):**
    - Real user data (Emails, Phone Numbers, Full Names, National IDs) must NEVER be logged or stored in agent memories.
    - If a task requires processing PII, use anonymized placeholders or unique hashes in logs.
    - **@security** agent must audit any new log entry for potential PII leakage.
- **Zero-Trust Memory:** Agent memories (PROJECT_MEMORY.md) must never contain real customer data; only technical metadata and architectural decisions must be stored.
