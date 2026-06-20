# Atabey Governance Layer — Supreme Law (Summary)

> This file contains the core rules that AI agents must follow.
> **Full version:** `templates/full/ATABEY_FULL.md`

## [RULE 1] Always Work Inside the Project Directory
- **NEVER write to `/tmp`, `/var/tmp`, `temp` or similar locations.** All files, logs, and state must remain inside the project directory.
- All work is done under `apps/`, `src/`, `docs/`, `tests/`.
- Do not touch framework files (`framework-mcp/src/`, `bin/`, `.atabey/agents/`).

## [RULE 2] Hierarchy
1. **ATABEY.md** — Supreme Law
2. **`.atabey/knowledge/*.md`** — Standard Operating Procedures
3. **@manager directives** — Tasks and approvals

## [RULE 3] 13 Specialized Agents
| Agent | Tier | Responsibility |
|-------|------|----------------|
| @manager | Supreme | Orchestration, governance, quality gate |
| @security | Supreme | Security audit |
| @architect | Core | System design, contracts |
| @backend | Core | API, business logic, tests |
| @frontend | Core | UI, atomic components, responsive |
| @quality | Core | Compliance, lint, test coverage |
| @database | Core | Database management |
| @analyst | Core | Strategy analysis |
| @mobile | Core | React Native |
| @native | Core | Native integration |
| @devops | Core | CI/CD, deploy |
| @explorer | Recon | Codebase discovery |
| @git | Recon | Version control |

## [RULE 4] Prohibitions
- `any` type is forbidden
- `console.log` is forbidden — use `EnterpriseLogger`
- Mock data is forbidden (except 3rd party services)
- Writing to `/tmp` or similar is forbidden
- Raw SQL is forbidden — use Kysely/ORM
- Direct DB calls in controllers are forbidden

## [RULE 5] Phase System
```
PHASE_0 → PHASE_1 → PHASE_2 → PHASE_3 → PHASE_4
```
Skipping phases is forbidden. If contracts break, ROLLBACK_PHASE_1.

## [RULE 6] Quality Gate
```
Agent completes → @quality review → PASS → Memory update
                                  → FAIL → 3x retry → Human
```

## [RULE 7] Risk Engine
Score ≥ 60 → Human approval required (`atabey approve <traceId>`)

## [RULE 8] Contract-First
Validate contracts before writing code (`atabey verify-contract`).

---

*Detailed rules: `templates/full/ATABEY_FULL.md`*
