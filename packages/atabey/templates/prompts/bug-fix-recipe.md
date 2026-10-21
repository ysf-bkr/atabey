# 🐞 Scientific Bug Diagnosis & Fix Recipe: diagnose

This recipe governs the scientific, hypothesis-driven debugging protocol executed by the **@quality**, **@backend**, and **@frontend** agents.

---

## 🎯 Core Directive: Shotgun Debugging is Strictly Forbidden

> **Constitutional Rule:** Random trial-and-error editing ("shotgun debugging") is prohibited. You are forbidden from modifying application source code until you have reproduced the failure with a deterministic failing test and formulated explicit testable hypotheses.

---

## 🔬 The 6-Step Scientific Diagnosis Protocol

```
1. REPRODUCE ──► 2. HYPOTHESIZE ──► 3. INSTRUMENT ──► 4. ISOLATE ──► 5. FIX ──► 6. VERIFY
   (Failing Test)   (>=2 Hypotheses)    (Telemetry/Logs)   (Root Cause)    (Surgical)   (Green Suite)
```

### Step 1: Deterministic Reproduction (Mandatory Failing Test)
- Never assume you know the cause from reading logs alone.
- Write the minimal isolated test case in the appropriate `tests/` subdirectory that reproduces the exact failure.
- Run the test suite: verify that the new test fails with the expected error (**RED** phase).
- **Rule:** If you cannot write a test that reproduces the bug, stop and request clarification.

### Step 2: Multi-Hypothesis Formulation
- Before touching any source code, formulate **at least two distinct hypotheses** explaining why the failure occurs:
  - *Hypothesis A:* Example: Concurrency race condition on cache eviction causes null pointer.
  - *Hypothesis B:* Example: Schema migration missing default value for optional column under SQLite.
- Write down these hypotheses in your task scratchpad or execution log.

### Step 3: Targeted Instrumentation
- Add temporary, high-precision structured log entries using `EnterpriseLogger` around the suspect code execution path.
- Include contextual identifiers: `traceId`, input arguments, timestamps, and return values.
- Re-run the reproduction test to collect empirical runtime telemetry.

### Step 4: Isolation & Root Cause Identification
- Analyze the telemetry against your hypotheses.
- Disprove incorrect hypotheses with empirical data until only the true root cause remains isolated.
- Clean up any temporary diagnostic instrumentation before applying the fix.

### Step 5: Minimal Surgical Fix
- Apply the smallest, most precise patch that eliminates the root cause.
- **Rules of Surgical Editing:**
  - Do not refactor unrelated code in the same commit.
  - Do not introduce workarounds (e.g., adding `// @ts-ignore` or catch-all try/except blocks that swallow errors).
  - Use `replace_text` or `patch_file` rather than overwriting entire files.

### Step 6: Verification & Non-Regression Gate
- Re-run the reproduction test: verify that it now passes (**GREEN** phase).
- Run the entire project test suite (`npm test` or `vitest run`) to prove zero regressions exist in adjacent subsystems.
- Verify that code coverage remains ≥ 80%.
- Document the root cause and the fix in the task handoff notes.
