# Contributing Guide — Agent Atabey

Thank you for considering contributing to Agent Atabey! This guide explains how you can contribute to the project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Development Environment](#development-environment)
- [Project Architecture](#project-architecture)
- [Commit Rules](#commit-rules)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Bug Reporting](#bug-reporting)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

- **Be respectful:** Use respectful and inclusive language toward all participants.
- **Be constructive:** Criticism should be constructive and solution-oriented.
- **Collaborate:** Open communication and collaboration are essential.

---

## Before You Start

1. **Check existing Issues:** See if there's an open Issue for the bug or feature.
2. **Discuss:** Open an Issue to discuss major changes before implementing.
3. **Read ATABEY.md:** Make sure you understand the project's Supreme Law.

---

## Development Environment

### Requirements

| Requirement | Version |
|-----------|-------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |

### Setup

```bash
# Clone the repository
git clone https://github.com/ysf-bkr/atabey.git
cd atabey

# Install dependencies
npm install
npm install --prefix framework-mcp
npm install --prefix framework-mcp/dashboard

# Build the project
npm run build
```

### Development Commands

```bash
# Build
npm run build                  # Full build (core + mcp + ui)
npm run build:core             # Core TypeScript only
npm run build:mcp              # MCP server only
npm run build:ui               # Dashboard UI only

# Test
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report

# Lint
npm run lint                   # ESLint check
```

---

## Project Architecture

The project consists of 3 main parts:

### 1. `src/` — Core Framework (CLI + Modules)
```
src/
├── cli/          # CLI commands (30+)
├── modules/      # Engines, Agents, Gateway, Memory
├── shared/       # Shared utilities (Logger, Storage, Types)
└── contracts/    # API contracts
```

### 2. `framework-mcp/` — MCP Server
```
framework-mcp/
├── src/          # MCP Server (30+ Tools)
│   ├── tools/    # Tool implementations
│   └── utils/    # Helper functions
├── dashboard/    # React Dashboard (Vite)
└── tests/        # MCP tests
```

### 3. `templates/` — Templates
```
templates/
├── full/         # Full ATABEY.md
├── prompts/      # Prompt recipes
└── standards/    # Enterprise standards
```

---

## Commit Rules

Use the following format for commit messages:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (format, punctuation) |
| `refactor` | Code restructuring |
| `test` | Adding/fixing tests |
| `chore` | Maintenance tasks (build, packages) |
| `perf` | Performance improvement |
| `security` | Security fix |

### Examples

```
feat(gateway): add Ollama provider support
fix(memory): resolve race condition in vector store
docs(readme): add API documentation section
test(quality): add compliance checker tests
```

### Trace ID

All commits should include a Trace ID (optional):

```
feat(backend): add user login service

Trace: T-2024-abc123
```

---

## Pull Request Process

1. **Fork:** Fork the repository and work on your own branch.
2. **Branch naming:** `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`
3. **Small PRs:** Don't make too many changes in a single PR.
4. **Add tests:** Include tests for new code.
5. **Lint check:** Run `npm run lint` to check your code.
6. **Run tests:** Ensure all tests pass with `npm test`.
7. **Open PR:** Explain what and why you changed in the PR description.

### PR Template

```markdown
## Description
This PR adds/fixes [short description].

## Related Issue
Closes #123

## Changes
- [x] New feature: ...
- [ ] Bug fix: ...
- [ ] Documentation: ...
- [ ] Test: ...

## Testing
- [ ] All tests pass
- [ ] New tests added
- [ ] No lint errors
```

---

## Code Standards

### TypeScript

- **Zero Type Hole:** `any` type is STRICTLY forbidden.
- Zod schema runtime validation is mandatory.
- All functions must specify return types.
- JSDoc comments should be added.

### Naming

- **Classes:** PascalCase (`RoutingEngine`, `QualityGate`)
- **Functions:** camelCase (`resolveAgent`, `generateSubTasks`)
- **Constants:** UPPER_SNAKE_CASE (`FRAMEWORK_DIR`)
- **Files:** kebab-case (`routing-engine.ts`, `quality-gate.ts`)

### Prohibitions (ATABEY.md Rule 4)

- `any` type forbidden
- `console.log` forbidden — use `EnterpriseLogger`
- Mock data forbidden (except 3rd party services)
- Writing to `/tmp` forbidden
- Raw SQL forbidden — use Kysely/ORM
- Direct DB calls in controllers forbidden

---

## Testing

Tests are mandatory for all new code.

### Test Types

- **Unit Test:** Written with Vitest
- **Integration Test:** Runs on real SQLite
- **Engine Test:** Deterministic engine tests

### Test File Locations

```
tests/
├── modules/engines/    # Engine tests
├── modules/memory/     # Memory tests
├── cli/commands/       # CLI command tests
├── integration/        # Integration tests
└── shared/             # Shared utility tests
```

### Test Writing Rules

```typescript
import { describe, it, expect } from "vitest";
import { RoutingEngine } from "../../src/modules/engines/routing-engine.js";

describe("RoutingEngine", () => {
    it("should route backend tasks correctly", () => {
        const result = RoutingEngine.resolveWithDetails("Create a login API");
        expect(result.agent).toBe("@backend");
        expect(result.confidence).toBe("high");
    });
});
```

---

## Bug Reporting

When you find a bug, report it via GitHub Issues:

1. **Title:** Use a descriptive title
2. **Description:** Explain step-by-step how to reproduce
3. **Expected Behavior:** What should happen
4. **Actual Behavior:** What actually happens
5. **Environment:** Node.js version, OS, package version

```markdown
## Bug Description
...

## Reproduction Steps
1. Run `npx atabey init`
2. ...

## Expected Behavior
...

## Actual Behavior
...

## Environment
- Node.js: v20.0.0
- OS: macOS 15.0
- atabey: v0.0.13
```

---

## Feature Requests

To request a new feature:

1. **Check existing Issues:** See if a similar request exists.
2. **Open new Issue:** Open an Issue with the `feature` label.
3. **Use case:** Explain the scenario where the feature would be used.
4. **Suggested solution:** Share ideas on how it could be implemented.

---

## License

Your contributions will be licensed under the project's [MIT license](LICENSE).
