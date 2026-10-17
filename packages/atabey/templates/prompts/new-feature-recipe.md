# ✨ New Feature Development Recipe

The "Atabey Order" steps to follow when adding a new module or feature.

## 1. Contract Design (Phase 1)
- First, update the `contract.version.json` file and the relevant TypeScript types.
- Do not start writing code without getting approval from `@architect`.

## 2. Mock-Free Development (Phase 2)
- Add the new feature to the correct directory under `apps/backend` or `apps/web`.
- If database changes are required, coordinate with the `@database` agent.

## 3. Responsive & i18n (Phase 3)
- Use `{ base: '...', md: '...' }` responsive syntax in frontend developments.
- Move all texts to the `locales/` directory immediately.

## 4. Completion (Phase 4)
- Ensure no TODOs remain using `get_project_gaps`.
- Verify that you haven't created any new package pollution with `audit_dependencies`.
