# Authentication & Authorization Standards

> JWT + bcrypt authentication and role-based access control for Fastify APIs.

## Overview

Enterprise-grade authentication system using JSON Web Tokens (JWT) for stateless authentication and bcrypt for secure password hashing.

## Setup

```bash
# Required dependencies
npm install bcrypt jsonwebtoken
npm install -D @types/bcrypt @types/jsonwebtoken
```

## Token Management

```typescript
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

interface AuthPayload {
  sub: string;     // User ID
  email: string;   // User email
  role: string;    // User role (ADMIN, DEVELOPER, VIEWER)
  iat?: number;    // Issued at
  exp?: number;    // Expires at
}

export function generateToken(payload: AuthPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthPayload {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
}
```

## Middleware

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";

export async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing authorization header");
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    (request as any).user = payload;
}

export function requireRole(...roles: string[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user as AuthPayload;
        if (!user || !roles.includes(user.role)) {
            throw new ForbiddenError("Insufficient permissions");
        }
    };
}
```

## Password Security

```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

// Hash password for storage
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password against hash
export async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
```

## CRUD Governance Integration

Admin-level mutations (user creation, role changes, schema modifications) **MUST** follow the CRUD Governance protocol:
- Route through `@manager` for approval
- Require human sign-off via `atabey approve <traceId>`
- Log all authorization decisions

## API Endpoints

| Method | Path | Auth Required | Role Required | Description |
|--------|------|:------------:|:------------:|-------------|
| POST | `/api/v1/auth/register` | No | No | Create new user |
| POST | `/api/v1/auth/login` | No | No | Login & get token |
| GET | `/api/v1/auth/me` | Yes | No | Get current user |
| PUT | `/api/v1/auth/password` | Yes | No | Change password |

## Environment Variables

```bash
JWT_SECRET=your-secret-key-at-least-32-chars-long
JWT_EXPIRES_IN=24h
```

## Best Practices

1. **Password Hashing**: Always use bcrypt with minimum 12 salt rounds
2. **Token Expiry**: Use short-lived tokens (24h max). Implement refresh tokens for longer sessions
3. **Secret Rotation**: Rotate JWT_SECRET periodically in production
4. **Rate Limiting**: Apply rate limiting on login/register endpoints to prevent brute force
5. **HTTPS Only**: Never transmit tokens over unencrypted connections
6. **Password Strength**: Enforce minimum password requirements (8+ chars, mixed case, numbers)
7. **Audit Logging**: Log all authentication attempts (success/failure) for security monitoring
8. **No Plain Text**: Never log or store passwords in plain text
9. **Token Storage**: Store tokens securely (httpOnly cookies for web, secure storage for mobile)
10. **Role Hierarchy**: ADMIN > MANAGER > DEVELOPER > VIEWER — validate permissions at each level
