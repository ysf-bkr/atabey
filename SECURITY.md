# Security Policy

## Supported Versions

We actively support and patch the following versions of Atabey:

| Version | Supported |
| ------- | --------- |
| < 0.0.20 | ❌ No      |
| >= 0.0.20 | ✅ Yes     |

## Transport Security

- **Encrypted transports:** the unified MCP server, dashboard, and WebSocket feed all run through a single HTTP(S) factory. Set `ATABEY_TLS_CERT_FILE` + `ATABEY_TLS_KEY_FILE` to serve over **TLS 1.3** (minimum version configurable via `ATABEY_TLS_MIN_VERSION`).
- **mTLS:** `ATABEY_MTLS_REQUIRED=true` with `ATABEY_TLS_CA_FILE` requires and verifies client certificates.
- **Fail-closed:** `ATABEY_TLS_REQUIRED=true` refuses to start without TLS; plaintext binding to a non-loopback host is rejected unless `ATABEY_ALLOW_INSECURE_BIND=true`.
- **Auth gate:** set `MCP_AUTH_TOKEN` (and optionally `MCP_AUTH_REQUIRED=true`) to require `Authorization: Bearer <token>` on HTTP/SSE; WebSocket upgrades accept `?token=`. Dashboard API routes and the WS feed enforce this gate.
- **Secrets:** store credentials with `atabey secrets` (AES-256-GCM vault); sensitive env vars are stripped from spawned subprocesses.

### Known limitation

When no token is configured and TLS is off, the server is **open access** (intended for local dev only). Always configure `MCP_AUTH_TOKEN` + TLS/mTLS before exposing it on a network.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it to us as soon as possible. We take security seriously and will investigate all reports.

Please do **NOT** open a public GitHub issue for security vulnerabilities. Instead, send an email to:

**ybekar@msn.com**

Please include the following information in your email:
- A description of the vulnerability and its potential impact.
- Detailed, step-by-step instructions to reproduce the issue.
- Any proof-of-concept (PoC) code or screenshots if available.
- Your name and preferred method of contact.

### Our Response Process

1. **Acknowledgment:** We will acknowledge receipt of your report within 48 hours.
2. **Investigation:** We will investigate the issue and determine the appropriate fix.
3. **Resolution:** We will work to resolve the issue as quickly as possible and will keep you informed of our progress.
4. **Disclosure:** Once a fix is released, we will publish a security advisory and credit you for the discovery (unless you prefer to remain anonymous).
