# 🏛️ Agent Atabey — Blind Spots, Limitations, and Development Report (BLINDSPOTS)

This file honestly outlines the current architectural constraints, development weaknesses, and gaps between the "Enterprise Governance" claims and the technical reality of the **Agent Atabey** project.

---

## 1. "Vibe Coding" & Early Stage Maturity Level
* **Current Status:** The project is in the pre-alpha stage, hovering around `0.0.x` versions on the npm registry, with over 20 versions published by a single author within 18 days. It does not yet have stars, forks, or community validation on GitHub.
* **Blind Spot:** Although the marketing language presents it as an "Enterprise-Grade Governance" framework and "Autonomous Orchestrator", it has not yet been battle-tested in production environments. Extremely rapid and irregular release cycles do not provide stability guarantees.
* **Roadmap/Solution:** Strict adherence to Semantic Versioning (SemVer), expanding test coverage, and positioning the project as an "active open-source experiment".

---

## 2. Deterministic Nature of the Risk Engine
* **Current Status:** The `RiskEngine` class uses static keywords (`delete`, `drop`, `truncate`, `rm -rf`) and regex patterns to score task descriptions and file changes.
* **Blind Spot:** What is advertised as an "AI-driven Risk Engine" or "Contextual Behavioral Analysis" is actually a **simple ~200 line deterministic rule engine**. It can easily be bypassed by complex, indirect, or manipulative instructions (such as prompt injection).
* **Roadmap/Solution:** Keep the regex-based rule engine as the first line of defense, but integrate LLM-based intent classification and safety guardrails behind it.

---

## 3. Lack of Sandboxing (Secure Execution Environment)
* **Current Status:** Autonomous shell commands (`run_command`) executed by agents run directly on the developer's host machine.
* **Blind Spot (Major Security Risk):** If an agent goes rogue or falls victim to a prompt injection attack, it can delete files on the local machine, leak environment variables (`.env`), or install malicious software. In real enterprise environments, executing un-sandboxed bash commands directly on host machines is strictly unacceptable.
* **Roadmap/Solution:** Implement a secure runtime abstraction that forces command execution and file manipulation to run inside isolated **Docker containers**, **WASM sandboxes**, or transient MicroVMs (e.g., Fly.io microVMs).

---

## 4. Limitations of File-Based Messaging (Hermes)
* **Current Status:** Multi-agent orchestration relies on JSON message files and local file locks (`.lock`) under the `.atabey/messages/` directory.
* **Blind Spot:** This mechanism works well on a single developer's machine. However, in enterprise environments where multiple developers collaborate or agents run asynchronously in distributed CI/CD pipelines, file locks will conflict, and git conflicts will occur.
* **Roadmap/Solution:** Abstract the Hermes message broker architecture to allow integration with real message queue brokers like **Redis Pub/Sub, NATS, or RabbitMQ** in production environments.

---

## 5. Regex-Based PII Masking Boundaries
* **Current Status:** The PII masking module (`packages/shared/src/pii.ts`) uses regex patterns to detect and mask emails, phone numbers, Turkish TC IDs, IBANs, and API keys.
* **Blind Spot:** While regex works well for structured data patterns, it is highly prone to false positives/negatives in unstructured free text (e.g. capturing names, custom addresses, or health records).
* **Roadmap/Solution:** Supplement regex rules with semantic PII analysis using local lightweight NLP models (e.g., Microsoft Presidio Analyzer or small local NER models).

---

## 6. Delayed AST/Compliance Validation
* **Current Status:** Code compliance checks (e.g., forbidding `any` types or unauthorized loggers) run post-facto via CLI commands (like `check:compliance`) after the code is written and saved to disk.
* **Blind Spot:** Checking code after the agent writes and saves it results in lost time. The agent might continue writing dependent code based on non-compliant files before the violation is flagged.
* **Roadmap/Solution:** Shift compliance checks into the MCP server's `write_file` or `replace_text` tools, executing **in-memory AST analysis before files are written to disk** to reject violations instantly and provide immediate feedback to the agent.

---

## 7. HITL (Human-in-the-Loop) Developer Experience (DX) Barrier
* **Current Status:** Operations with a risk score >= 60 require human approval, forcing the developer to run `atabey approve [traceId]` in the terminal.
* **Blind Spot:** This workflow disrupts the developer's flow state, requiring constant polling or checking of the terminal screen.
* **Roadmap/Solution:** Relocate approvals into team communication platforms (via interactive Slack or MS Teams buttons) or pull request comment integrations (e.g. replying `/approve` on GitHub PRs).

---

## 8. Installation & Dependency Issues
* **Current Status:** The project depends on `better-sqlite3` for local storage, which requires native C++ compilation.
* **Blind Spot:** Native compilation often fails on certain Node.js versions or restricted-privilege CI/CD environments, contradicting the "zero-config npx init" quick setup promise.
* **Roadmap/Solution:** Provide alternative database clients that do not require native compilation, such as pure-JS SQLite clients (e.g. `@libsql/client` or pre-compiled sqlean).
