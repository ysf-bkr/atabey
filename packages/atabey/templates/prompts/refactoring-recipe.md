# 🛠️ Surgical Refactoring Recipe

This recipe defines how to modernize existing code without breaking other parts of the project.

## 1. Reconnaissance
- Use `grep_search` to find all references to the function to be refactored.
- Understand the module's dependency graph with `get_project_map`.
- Verify the baseline by running existing tests (`run_tests`).

## 2. Planning (Strategy)
- Break the change into small, atomic steps.
- Define new types and interfaces first.

## 3. Surgical Execution
- **RULE:** Never delete a file completely. Only use `replace_text` or `batch_surgical_edit`.
- Maintain type safety (ban on `any`) at every step.
- Update `PROJECT_MEMORY.md` after every major change.

## 4. Validation
- Ensure no regressions occurred using `run_tests`.
- Audit code quality with the `@quality` agent.
