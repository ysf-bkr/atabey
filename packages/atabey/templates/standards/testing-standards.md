# [SKILL] Corporate Testing Standards

This document defines the testing discipline and scope rules for projects managed by Agent Atabey. Code quality must be ensured with automated tests.

## 1. Test Pyramid and Strategy
- **Unit Tests:** Written for the smallest parts of business logic. Must be fast and isolated.
- **Integration Tests:** Audits the compatibility of services with the database or external APIs.
- **E2E Tests:** Simulates critical user flows (Login, Checkout, etc.) in a real browser environment.

## 2. Writing Rules and Naming
- **Framework:** Vitest (Unit/Integration) and Playwright (E2E) are standard.
- **File Naming:** The `[module-name].test.ts` format is used.
- **Pattern (Given-When-Then):**
  ```typescript
  it("should create a user when valid data is provided", async () => {
    // Given
    const userData = { ... };
    // When
    const result = await userService.create(userData);
    // Then
    expect(result.id).toBeDefined();
  });
  ```

## 3. Scope and Success Criteria
- **Critical Path Coverage:** Auth, Payment, and Data Mutation processes must have 100% test coverage.
- **Zero Mock Policy (Internal):** Real contracts and test databases should be used between internal project services instead of mocks. External services (Stripe, Twilio, etc.) can be mocked.

## 4. Auditing
- The `@quality` agent verifies that the relevant test file is updated in each new function.
- Code that does not pass tests (`npm run test`) is never approved.
