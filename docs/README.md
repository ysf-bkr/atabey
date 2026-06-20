# 📁 docs/ — Project Documentation Directory

This directory contains the documentation files for the Agent Atabey framework. Agents (`@manager`, `@backend`, `@frontend`, etc.) reference files in this directory before writing code.

---

## 📋 Directory Structure

```
docs/
├── README.md              # This file — directory guide
├── ARCHITECTURE.md        # Detailed architecture documentation
├── CHANGELOG.md           # Changelog
├── CONTRIBUTING.md        # Contribution guide
├── SECURITY.md            # Security policy
├── BLINDSPOTS.md          # Duplicate code & blind spot analysis
└── (extensible)
```

---

## Root Directory Documents

| File | Description |
|-------|----------|
| `README.md` | Main project README — setup, usage, features |
| `ATABEY.md` | Supreme Law — core rules AI agents must follow |
| `CONTRIBUTING.md` | Contribution guide |
| `ARCHITECTURE.md` | Detailed architecture documentation |
| `CHANGELOG.md` | Version changelog |
| `SECURITY.md` | Security policy and vulnerability disclosure |
| `BLINDSPOTS.md` | Duplicate code & blind spot analysis report |
| `LICENSE` | MIT License |

---

## Template Directories

### `templates/prompts/` — Prompt Recipes

Ready-to-use prompt templates for AI agents:

| File | Description |
|-------|----------|
| `bug-fix-recipe.md` | Bug fix recipe |
| `contract-design-recipe.md` | Contract design recipe |
| `db-management-recipe.md` | Database management recipe |
| `deployment-recipe.md` | Deployment recipe |
| `new-feature-recipe.md` | New feature recipe |
| `performance-optimization-recipe.md` | Performance optimization recipe |
| `pull-request-template.md` | PR template |
| `refactoring-recipe.md` | Refactoring recipe |
| `security-audit-recipe.md` | Security audit recipe |

### `templates/standards/` — Enterprise Standards

30+ enterprise standard files:

| Category | Files |
|----------|----------|
| **Architecture** | `architecture-standards.md` |
| **Security** | `security-standards.md`, `auth-standards.md`, `security-audit-standards.md` |
| **Frontend** | `frontend-standards.md`, `tailwind-standards.md`, `vite-standards.md`, `react-router-standards.md`, `react-query-standards.md` |
| **Backend** | `nextjs-standards.md`, `typeorm-standards.md`, `kysely-standards.md`, `swagger-standards.md` |
| **Mobile** | `mobile-standards.md` |
| **Test** | `testing-standards.md`, `vitest-standards.md`, `playwright-standards.md` |
| **DevOps** | `deployment-standards.md`, `github-actions-standards.md` |
| **Quality** | `quality-standards.md`, `performance-standards.md` |
| **Governance** | `governance-standards.md`, `crud-governance.md`, `llm-governance.md` |
| **Logging** | `logging-and-secrets.md`, `pino-standards.md`, `observability-standards.md` |
| **Other** | `i18n-standards.md`, `token-economy.md` |

### `templates/full/` — Full ATABEY.md

| File | Description |
|-------|----------|
| `ATABEY_FULL.md` | Detailed version of ATABEY.md |

---

## Usage

### For Agents

Agents should reference the following files before executing tasks:

1. **ATABEY.md** — Supreme Law (core rules)
2. **ARCHITECTURE.md** — Project architecture
3. **templates/standards/** — Relevant enterprise standards
4. **templates/prompts/** — Relevant prompt recipes

### For Developers

Developers should review before contributing:

1. **CONTRIBUTING.md** — Contribution rules
2. **ARCHITECTURE.md** — Architecture decisions
3. **CHANGELOG.md** — Version history
4. **BLINDSPOTS.md** — Known issues

---

## File Rules

- All documents must be in `.md` (Markdown) format.
- Each file must include a title (`#`) and description.
- Do not keep unnecessary files in this directory.
- Documents must be kept up-to-date with code changes.

---

## Extension

To add new documents:

1. Choose a meaningful file name (e.g., `API.md`, `ROADMAP.md`)
2. Start with `# Title`
3. Add content and description
4. Update this README.md

---

*Last updated: 19.06.2026*
