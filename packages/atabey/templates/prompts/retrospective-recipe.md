# 🔄 Post-Task Retrospective Recipe: retro

This recipe defines the retrospective and learning preservation protocol executed by the **@manager** agent upon completion of a task, phase, or milestone.

---

## 🎯 Core Directive: Institutional Memory & Continuous Evolution

> **Constitutional Rule:** Completing code without capturing institutional learnings leads to recurring errors and loop thrashing. Every completed milestone must record lessons learned into `.atabey/memory/PROJECT_MEMORY.md` to permanently guide future agent runs.

---

## 📊 Retrospective Review Structure

When a task concludes or transitions to Phase 4 (Release/Complete), execute the following review steps:

### 1. Execution Telemetry Analysis
Analyze the operational telemetry recorded during the trace:
- **Total Agent Turns & Re-tries:** Did any agent exceed 2 retries on a task?
- **Thrashing & Oscillation Detection:** Did any agent repeatedly edit and revert the same file?
- **Quality Gate Outcome:** What issues were caught by the Dual-Axis Review in Phase 3?
- **Risk Score Accuracy:** Did the pre-calculated risk score accurately reflect operational friction?

### 2. Triad Reflection Questions
Answer these three questions candidly:
1. **What succeeded cleanly?**
   Identify patterns, prompt strategies, or architectural decisions that went smoothly and should be repeated.
2. **Where did friction occur?**
   Identify ambiguous specifications, missing types, flaky tests, or tool failures that caused delays.
3. **What rule or guideline would have prevented this friction?**
   Formulate a concrete, actionable rule to prevent future agents from repeating the issue.

---

## 💾 Institutional Memory Sync (`PROJECT_MEMORY.md`)

Update `.atabey/memory/PROJECT_MEMORY.md` under the `## [HISTORY]` section using this format:

```markdown
### 🏷️ Retrospective: <Trace ID> (<Feature / Bug Name>)
- **Date:** <YYYY-MM-DD>
- **Result:** SUCCESS | MITIGATED
- **Key Learnings:**
  - *Architecture:* <e.g., SQLite requires explicit foreign key PRAGMA in test harness>
  - *Governance:* <e.g., Zod schemas must explicitly validate ISO timestamp strings>
- **Actionable Rule Added:**
  - <Concrete constraint to adhere to in subsequent tasks>
```

---

## 🧹 Post-Retrospective Cleanup
- Release any lingering resource locks via `release_lock`.
- Ensure temporary diagnostic logs and scratch files have been removed from the working tree.
- Advance project state in `.atabey/memory/PROJECT_MEMORY.md` to the next Phase.
