# Testing Standards

> Unit and integration testing with Vitest for Node.js applications.

## Overview

Vitest is a blazing-fast unit test framework compatible with Jest API. It is used for both unit tests and API integration tests.

## Setup

```bash
npm install -D vitest
```

## Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/tests/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
```

## Test Structure

```
src/tests/
├── auth.test.ts           # Authentication tests
├── customers.test.ts      # Customer CRUD tests
├── helpers/
│   ├── setup.ts           # Test setup & teardown
│   └── factories.ts       # Test data factories
└── integration/
    └── api.test.ts        # Full API integration tests
```

## Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import { createCustomerSchema } from "../validators/schemas.js";

describe("Customer Validation", () => {
    it("should validate create customer schema", () => {
        const result = createCustomerSchema.parse({
            name: "Test Corp",
            status: "LEAD",
            annualValue: 50000,
        });
        expect(result.name).toBe("Test Corp");
    });

    it("should reject invalid data", () => {
        expect(() => createCustomerSchema.parse({ name: "" })).toThrow();
    });
});
```

## API Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

describe("Auth API", () => {
    const app = Fastify();

    beforeAll(async () => {
        await app.register(publicRoutes, { prefix: "/api/v1" });
        await app.ready();
    });

    afterAll(async () => await app.close());

    it("should reject invalid login", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "invalid", password: "test" },
        });
        expect(response.statusCode).toBe(400);
    });
});
```

## Best Practices

1. Use `describe`/`it` blocks for organized test suites
2. Test both success and failure scenarios
3. Use `app.inject()` for API tests (no server needed)
4. Keep tests isolated — clean state between tests
5. Aim for >80% coverage on business logic
6. Use factories for test data generation
7. Follow Given-When-Then pattern in all test suites
