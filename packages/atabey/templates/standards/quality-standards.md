# ⚖️ Corporate Code Quality and Discipline (Linting & Standards)

This document defines the technical discipline rules that all code produced by the Agent Atabey AL must comply with. The goal is zero errors, maximum readability, and sustainability.

## 1. TypeScript Discipline
- **Strict Mode:** `strict: true` is mandatory in all projects.
- **No Explicit Any:** The use of `any` is strictly forbidden. `unknown` should be used for uncertain types and verified with type guards.
- **Exhaustive Checks:** All cases must be checked (exhaustive) in `switch-case` structures, or safety must be provided with the `never` type.

## 2. ESLint and Static Analysis (AST Enforced)
- **Real-Time AST Audits:** Every file mutation by an agent is scanned via **Abstract Syntax Tree (AST)** analysis. Prohibited patterns (`any`, `console.log`) are blocked at the protocol level.
- **Zero Warnings:** No ESLint warnings or errors can exist in the codebase.
- **Naming Conventions:**
  - Variables and functions: `camelCase`
  - Classes and Types: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - File names: `kebab-case`
- **Imports:** Unused imports should be automatically cleaned, and the import order should be regular.

## 3. Formatting (Prettier)
- **Consistency:** Uniform formatting is mandatory in all files.
- **Indentation:** 4 spaces.
- **Quotes:** Use of double quotes (`"`).
- **Semicolons:** Each statement must end with a semicolon (`;`).

## 4. Error Handling
- **No Silent Failures:** Empty `catch` blocks are forbidden. Every error must at least be logged or passed to the upper layer.
- **Custom Errors:** Project-specific `AppError` classes should be used for business logic errors.

## 5. Audit Loop
- **Pre-commit:** `npm run lint` and `npm run type-check` must be run before code is committed.
- **@quality Audit:** All changes are audited by the `@quality` agent according to these standards.
