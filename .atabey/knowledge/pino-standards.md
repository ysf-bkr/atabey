# Logging Standards

> Structured logging with Pino for Node.js applications.

## Overview

Pino is a fast, low-overhead structured logger. All logs must be in JSON format for production.

## Setup

```bash
npm install pino
npm install -D pino-pretty
```

## Configuration

```typescript
import { pino } from "pino";

const logger = pino({
    transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss Z" } }
        : undefined,
    level: process.env.LOG_LEVEL || "info",
});

export { logger };
```

## Usage

```typescript
logger.info("Server started on port 4000");
logger.error({ err }, "Failed to connect to database");
logger.warn({ userId, action: "rate_limit" }, "Rate limit exceeded");
logger.debug({ query, params }, "Executing database query");
```

## Best Practices

1. Always pass Error objects as first argument: `logger.error({ err }, "msg")`
2. Use structured context objects instead of string interpolation
3. Never log sensitive data (passwords, tokens, PII)
4. Use child loggers for request-scoped logging
5. Set appropriate log levels (debug for dev, info for prod)
