# 🗺️ Agent Atabey — Project Roadmap

This document outlines the current progress and future directions for the **Agent Atabey** AI governance and orchestration framework.

---

## 📈 Current Status: `PHASE_0` (Foundation)
- [x] **Core Architecture:** SQLite-based Hermes message broker and active distributed lock engine.
- [x] **Stateless MCP Server:** Fully compatible with Claude Code, Gemini CLI, and Cursor.
- [x] **Project-Focus Scaffolding:** Initializer that configures agents based on project type (Fullstack, Backend-only, Frontend-only, Mobile).
- [x] **Static Compliance Engine:** AST-based scanner to enforce code quality policies (zero type holes, zero DOM mutation, etc.).

---

## 🎯 Short-term Goals (Next 1-2 Months)
- [ ] **Interactive Web Dashboard enhancements:**
  - Dynamic monitoring of active agent states with live WebSocket connections.
  - Interactive approval center for high-risk operations.
- [ ] **Type Safety Coverage:**
  - Resolve type differences in framework tests.
  - Ensure 100% test coverage for `framework-mcp` tools.
- [ ] **Continuous Integration (CI):**
  - Add GitHub Actions for automated health checks (`atabey check`) on Pull Requests.

---

## 🚀 Medium-term Features (Next 3-6 Months)
- [ ] **LLM Gateway & PII Proxy:**
  - Build a centralized server to mask PII data and cache embeddings dynamically across developer machines.
- [ ] **Automated Skill Learning:**
  - Let agents learn from developer corrections and persist skills in `.atabey/skills/`.
- [ ] **Git-native collaboration:**
  - Autonomous branch management and automated commit messages synced with active traces.

---

## 🔬 Long-term Vision (6+ Months)
- [ ] **Polyglot Agent Ecosystem:**
  - Full support for Go, Python, and .NET backend templates out-of-the-box.
- [ ] **Multi-repository Orchestration:**
  - Connect multiple microservice repositories under a single unified Atabey governance layer.
