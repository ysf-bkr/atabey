# 🔍 Dual-Axis Code Review Recipe: code-review

This recipe governs the code review protocol executed by the **@quality** and **@security** agents during **Phase 3 (Quality Gate)**.

---

## 🎯 Core Directive: The Dual-Axis Evaluation Matrix

> **Constitutional Rule:** Code cannot pass Phase 3 based on test execution alone. The review must evaluate the git diff against two independent axes:
> 1. **Axis 1 (Standards & Smell Compliance):** Adherence to Atabey's 37+ standards and absence of Fowler architectural code smells.
> 2. **Axis 2 (Specification Fidelity):** Exact fulfillment of acceptance criteria with zero scope creep.

---

## 📐 Axis 1: Standards Compliance & Fowler Code Smells

Inspect all modified and newly created files against this checklist:

### 1. Atabey Constitutional Prohibitions
- [ ] **No `any` Types:** Strictly verify full type coverage. `as any`, `unknown as any`, or loose types are immediate rejections.
- [ ] **No `console.log`:** All telemetry and diagnostic logs must use `EnterpriseLogger` with structured contextual keys (`traceId`).
- [ ] **No Raw Unparameterized SQL:** Database access must use typed Kysely schemas or ORM abstractions.
- [ ] **No Direct DB Calls in Controllers:** Handlers and controllers must call repositories or service layers.
- [ ] **No Fake Mocks in Integration Tests:** Tests under `tests/` must execute against real local databases or service-compatible test containers.
- [ ] **No Tests in `src/`:** All test files must reside strictly under `tests/`.
- [ ] **No Hardcoded Secrets or Credentials:** Verified absence of API keys, tokens, or plaintext secrets.

### 2. Martin Fowler Code Smell Detection
- [ ] **Large Class / God Object:** Has any class, service, or module accumulated too many unrelated responsibilities?
- [ ] **Long Method:** Are functions doing more than one discrete logical task? Break down functions longer than 40-50 lines.
- [ ] **Feature Envy:** Is a method excessively accessing fields or methods of another object rather than its own?
- [ ] **Primitive Obsession:** Are raw strings or numbers used where branded types (`UserId`, `Amount`) should represent domain invariants?
- [ ] **Leaky Abstractions:** Do internal storage or transport details leak into public domain signatures?

---

## 📐 Axis 2: Specification Acceptance Criteria Fidelity

Compare the git diff directly against the originating `SPEC-<ID>.md`:

### 1. Acceptance Criteria Verification
- [ ] **Gherkin Verification:** Does the implementation fulfill every `Given-When-Then` scenario defined in the specification?
- [ ] **Edge Cases Covered:** Are the edge cases specified in Section 6 tested and handled cleanly?
- [ ] **Negative Testing:** Are error responses verified when bad inputs, unauthorized access, or missing fields are submitted?

### 2. Scope Creep & Collateral Damage Check
- [ ] **Zero Scope Creep:** Did the author agent touch any file that was NOT part of the agreed plan?
- [ ] **Refactoring Containment:** Was incidental refactoring kept strictly within the boundary of the assigned ticket?
- [ ] **Contract Drift:** Did any public API or model change without updating `contract.version.json`?

---

## 🚦 Dual-Axis Review Output Template

Every review must conclude with this structured evaluation block:

```markdown
### 🛡️ Quality Gate Review Summary (Trace: <TRACE_ID>)

| Review Axis | Score (1-10) | Status | Key Findings |
| :--- | :---: | :---: | :--- |
| **Axis 1: Standards & Code Smells** | <X>/10 | PASS / FAIL | <Summary of violations or clean code> |
| **Axis 2: Specification Fidelity** | <Y>/10 | PASS / FAIL | <Acceptance criteria fulfilled / gaps> |

**Overall Verdict:** `PASS` | `FAIL (Retry)` | `ESCALATE_HUMAN`

#### Action Items for Implementation Agent:
1. ...
```
