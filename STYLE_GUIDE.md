# 🎨 Agent Atabey — Code Style Guide

This document outlines the coding standards, type-safety requirements, and style guidelines for developers contributing to the **Agent Atabey** framework.

---

## 🔒 1. Type Safety & Strict Isolation
- **Strict Mode:** TypeScript `strict` mode must be enabled on all configurations.
- **Zero Type Holes:** The use of `any` is strictly forbidden. Use `unknown` or define structured types/Zod schemas for dynamic inputs.
- **Exemptions:** Only `definitions.ts` and `types.ts` are exempt from the `any` check when interfacing with legacy or highly dynamic systems.

---

## 📂 2. File System & Mutation Standards
- **Atomic Operations:** Never write to files directly using `fs.writeFileSync` or `fs.appendFileSync` outside of `shared/fs.ts` or lock operations. Use the safe, atomic wrapper `writeTextFile` to prevent corruption.
- **Isolation Policy:** All framework states, caches, logs, and databases must reside inside the `.atabey/` directory. Writing to `/tmp` or other global paths is forbidden.

---

## ⚙️ 3. Execution & Subprocesses
- **No Direct Subprocesses:** Do not use the `child_process` module directly in business logic. All shell commands and CLI processes must run through the secure execution adapters to prevent command injection and ensure proper logging.

---

## 🛡️ 4. Security & Privacy
- **KVKK / GDPR Compliance:** Never write Personally Identifiable Information (PII) to logs or status files. If processing user emails, credentials, or credit cards, they must be scrubbed using the `pii` mask tool.
- **No Hardcoded Credentials:** API keys, secrets, and passwords must never be stored in code. Load them dynamically from environment variables or secure vault stores.
