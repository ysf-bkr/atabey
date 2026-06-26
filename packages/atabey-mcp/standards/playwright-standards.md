# E2E Testing Standards (Playwright)

> End-to-end testing for web applications.

## Overview

Playwright provides cross-browser E2E testing with auto-waiting and network interception.

## Setup

```bash
npm install -D @playwright/test
npx playwright install
```

## Test Structure

```
e2e/
├── auth.spec.ts          # Login/logout flows
├── customers.spec.ts     # Customer CRUD flows
├── navigation.spec.ts    # Navigation & routing
└── fixtures/
    └── auth.fixture.ts   # Authenticated test context
```

## Example Test

```typescript
import { test, expect } from "@playwright/test";

test("user can login and see dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill("[name=email]", "admin@example.com");
    await page.fill("[name=password]", "password123");
    await page.click("button[type=submit]");
    await expect(page.locator("text=Dashboard")).toBeVisible();
});

test("admin can view customers list", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("text=Northwind")).toBeVisible();
});
```

## Best Practices

1. Test critical user flows (login, CRUD, navigation)
2. Use page objects for reusable test actions
3. Run tests in CI pipeline on every push
4. Use fixtures for authenticated test contexts
5. Keep tests independent — no shared state
6. Use data-testid attributes for reliable selectors
