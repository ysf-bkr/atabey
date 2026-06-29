# Contributing to Agent Atabey

Thank you for your interest in contributing to **Agent Atabey**! As an open-source project, we welcome contributions of all kinds, including bug reports, feature requests, documentation improvements, and code changes.

Please read through these guidelines to ensure a smooth contribution process.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Contribute](#how-to-contribute)
   - [Reporting Bugs](#reporting-bugs)
   - [Suggesting Features](#suggesting-features)
   - [Submitting Pull Requests](#submitting-pull-requests)
3. [Local Development Setup](#local-development-setup)
4. [Coding Standards](#coding-standards)
5. [License](#license)

---

## 🤝 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please respect other contributors, use welcoming and inclusive language, and be collaborative.

---

## 🚀 How to Contribute

### Reporting Bugs

If you find a bug, please create a new issue on GitHub using our Bug Report template. Be sure to include:
- A clear description of the bug
- Steps to reproduce the issue
- Expected vs. actual behavior
- Environment details (Node.js version, OS, active AI tool)
- Relevant log files or error output

### Suggesting Features

We welcome new feature requests! Please create an issue using our Feature Request template and describe:
- The problem the feature solves
- The proposed solution or behavior
- Any alternative approaches considered

### Submitting Pull Requests

1. **Fork the repository** and create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Implement your changes** and ensure they adhere to our coding standards.
3. **Add tests** to cover your changes and run the test suite:
   ```bash
   npm test
   ```
4. **Enforce Linting:** Make sure your code passes linter checks:
   ```bash
   npm run lint
   ```
5. **Commit your changes** with a clear message:
   ```bash
   git commit -m "feat(mcp): add new capability [T-XYZ]"
   ```
6. **Push to your fork** and submit a Pull Request to our repository.

---

## 💻 Local Development Setup

Atabey is structured as a monorepo using npm workspaces:

- `packages/shared`: Shared utilities (database, lock, logging, PII masking).
- `packages/atabey`: Core engine and CLI.
- `packages/atabey-mcp`: MCP server and dashboard UI.

### Installation

Clone and install dependencies at the root of the workspace:
```bash
git clone https://github.com/ysf-bkr/atabey.git
cd atabey
npm install
```

### Build & Test

To build all packages:
```bash
npm run build
```

To run all unit tests:
```bash
npm test
```

---

## 📏 Coding Standards

- **Strict Type-Safety:** Strict mode is enabled (`strict: true`). The use of `any` types is strictly forbidden.
- **Structured Logging:** Avoid `console.log`. Use `logger` / `EnterpriseLogger` for structured debug/info outputs.
- **KVKK/GDPR Compliance:** Mask sensitive data or credentials before outputting them to logs or external contexts.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's **GNU Affero General Public License v3.0 (AGPL-3.0)**.
