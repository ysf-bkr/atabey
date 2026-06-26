# API Documentation Standards

> OpenAPI/Swagger documentation for Fastify APIs.

## Overview

Auto-generated API documentation using @fastify/swagger and @fastify/swagger-ui.

## Setup

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

## Configuration

```typescript
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

await app.register(swagger, {
    openapi: {
        info: {
            title: "API Name",
            version: "1.0.0",
            description: "Enterprise API documentation",
        },
        servers: [{ url: process.env.API_URL || "http://localhost:4000" }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
    },
});

await app.register(swaggerUi, { routePrefix: "/docs" });
```

## Best Practices

1. Define all request/response schemas using Zod or TypeBox
2. Group routes by tags (Users, Customers, Reports)
3. Include error responses in schema definitions
4. Version your API (e.g., /api/v1/, /api/v2/)
5. Keep documentation up to date with code changes
