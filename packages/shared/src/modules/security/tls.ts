/**
 * TLS 1.3 / mTLS transport security for Atabey HTTP + WebSocket servers.
 *
 * All network-facing servers (MCP unified server) go through
 * `createHttpOrHttpsServer()` so encryption is applied uniformly.
 *
 * Environment:
 *   ATABEY_TLS_ENABLED=auto|true|false   (auto = enabled when cert+key set)
 *   ATABEY_TLS_CERT_FILE=/path/cert.pem  (server certificate, PEM)
 *   ATABEY_TLS_KEY_FILE=/path/key.pem    (server private key, PEM)
 *   ATABEY_TLS_CA_FILE=/path/ca.pem      (CA bundle; required for mTLS)
 *   ATABEY_TLS_MIN_VERSION=TLSv1.3       (TLSv1.3 | TLSv1.2)
 *   ATABEY_MTLS_REQUIRED=true            (require + verify client certificates)
 *   ATABEY_TLS_REQUIRED=true             (fail hard if TLS not configured)
 *   ATABEY_ALLOW_INSECURE_BIND=true      (allow plaintext on non-loopback host)
 *
 * Cipher suites are left to Node's secure defaults, which already prefer
 * TLS 1.3 (AES-256-GCM / CHACHA20-POLY1305). We additionally enforce a modern
 * minimum version and disable session tickets for HITL-sensitive traffic.
 */

import fs from "fs";
import http from "http";
import https from "https";

export type TlsMinVersion = "TLSv1.2" | "TLSv1.3";

export interface ResolvedTlsConfig {
    /** Whether the server will actually listen over TLS. */
    enabled: boolean;
    minVersion: TlsMinVersion;
    mtlsRequired: boolean;
    /** ATABEY_TLS_REQUIRED — hard-fail when TLS is not configured. */
    required: boolean;
    certFile?: string;
    keyFile?: string;
    caFile?: string;
    /** Present only when enabled. */
    serverOptions?: https.ServerOptions;
}

function envBool(key: string, fallback = false): boolean {
    const v = process.env[key];
    if (v === undefined) return fallback;
    return v === "true" || v === "1" || v === "yes";
}

/**
 * Resolve the TLS configuration from environment. Throws when TLS is enabled
 * but the certificate material is missing/invalid, or when mTLS is required
 * without a CA bundle.
 */
export function resolveTlsConfig(): ResolvedTlsConfig {
    const certFile = process.env.ATABEY_TLS_CERT_FILE?.trim() || undefined;
    const keyFile = process.env.ATABEY_TLS_KEY_FILE?.trim() || undefined;
    const caFile = process.env.ATABEY_TLS_CA_FILE?.trim() || undefined;
    const mtlsRequired = envBool("ATABEY_MTLS_REQUIRED", false);
    const required = envBool("ATABEY_TLS_REQUIRED", false);
    const minVersion = (process.env.ATABEY_TLS_MIN_VERSION?.trim() || "TLSv1.3") as TlsMinVersion;

    if (minVersion !== "TLSv1.2" && minVersion !== "TLSv1.3") {
        throw new Error(`[TLS] Invalid ATABEY_TLS_MIN_VERSION "${minVersion}" (use TLSv1.2 or TLSv1.3).`);
    }

    const hasKeyPair = Boolean(certFile && keyFile);
    const explicit = process.env.ATABEY_TLS_ENABLED;
    const enabled = explicit === undefined ? hasKeyPair : envBool("ATABEY_TLS_ENABLED", hasKeyPair);

    if (!enabled) {
        return { enabled: false, minVersion, mtlsRequired, required, certFile, keyFile, caFile };
    }

    if (!certFile || !keyFile) {
        throw new Error("[TLS] ATABEY_TLS_ENABLED is set but ATABEY_TLS_CERT_FILE / ATABEY_TLS_KEY_FILE are missing.");
    }
    for (const f of [certFile, keyFile]) {
        if (!fs.existsSync(f)) throw new Error(`[TLS] Certificate file not found: ${f}`);
    }
    if (mtlsRequired && !caFile) {
        throw new Error("[TLS] ATABEY_MTLS_REQUIRED=true requires ATABEY_TLS_CA_FILE (client CA bundle).");
    }
    if (caFile && !fs.existsSync(caFile)) {
        throw new Error(`[TLS] CA file not found: ${caFile}`);
    }

    const serverOptions: https.ServerOptions = {
        minVersion,
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
        honorCipherOrder: true,
        // Avoid stale TLS sessions after key rotation.
        sessionTimeout: 0,
    };
    if (caFile) serverOptions.ca = fs.readFileSync(caFile);
    if (mtlsRequired) {
        serverOptions.requestCert = true;
        serverOptions.rejectUnauthorized = true;
    }

    return { enabled: true, minVersion, mtlsRequired, required, certFile, keyFile, caFile, serverOptions };
}

/**
 * Outbound (client) TLS options for HTTPS requests made by Atabey tooling.
 *
 * Environment:
 *   ATABEY_TLS_CLIENT_CERT_FILE=/path/client.crt   (mTLS client certificate)
 *   ATABEY_TLS_CLIENT_KEY_FILE=/path/client.key    (mTLS client key)
 *   ATABEY_TLS_CLIENT_CA_FILE=/path/ca.pem         (custom CA bundle)
 *   ATABEY_TLS_CLIENT_MIN_VERSION=TLSv1.3
 *   ATABEY_TLS_CLIENT_SERVERNAME=api.example.com   (optional SNI override)
 */
export interface OutboundTlsConfig {
    enabled: boolean;
    minVersion: TlsMinVersion;
    options: {
        cert?: Buffer;
        key?: Buffer;
        ca?: Buffer;
        minVersion?: TlsMinVersion;
        servername?: string;
    };
}

export function resolveOutboundTlsOptions(): OutboundTlsConfig {
    const certFile = process.env.ATABEY_TLS_CLIENT_CERT_FILE?.trim() || undefined;
    const keyFile = process.env.ATABEY_TLS_CLIENT_KEY_FILE?.trim() || undefined;
    const caFile = process.env.ATABEY_TLS_CLIENT_CA_FILE?.trim() || undefined;
    const minVersion = (process.env.ATABEY_TLS_CLIENT_MIN_VERSION?.trim() || "TLSv1.3") as TlsMinVersion;
    const servername = process.env.ATABEY_TLS_CLIENT_SERVERNAME?.trim() || undefined;

    if (minVersion !== "TLSv1.2" && minVersion !== "TLSv1.3") {
        throw new Error(`[TLS] Invalid ATABEY_TLS_CLIENT_MIN_VERSION "${minVersion}".`);
    }
    if ((certFile && !keyFile) || (keyFile && !certFile)) {
        throw new Error("[TLS] Outbound mTLS requires BOTH ATABEY_TLS_CLIENT_CERT_FILE and ATABEY_TLS_CLIENT_KEY_FILE.");
    }
    for (const f of [certFile, keyFile, caFile]) {
        if (f && !fs.existsSync(f)) throw new Error(`[TLS] Outbound certificate file not found: ${f}`);
    }

    const enabled = Boolean(certFile || keyFile || caFile);
    const options: OutboundTlsConfig["options"] = { minVersion };
    if (certFile) options.cert = fs.readFileSync(certFile);
    if (keyFile) options.key = fs.readFileSync(keyFile);
    if (caFile) options.ca = fs.readFileSync(caFile);
    if (servername) options.servername = servername;
    return { enabled, minVersion, options };
}

/**
 * Create an HTTPS server when TLS is configured, otherwise a plain HTTP server.
 * Both server types satisfy `http.Server`, so callers stay type-safe.
 */
export function createHttpOrHttpsServer(
    tls: ResolvedTlsConfig,
    handler: http.RequestListener,
): http.Server {
    if (tls.enabled && tls.serverOptions) {
        return https.createServer(tls.serverOptions, handler);
    }
    return http.createServer(handler);
}

/**
 * Human-readable description for logs / `/mcp/health`.
 */
export function describeTls(tls: ResolvedTlsConfig): string {
    if (!tls.enabled) return "disabled (plaintext)";
    return `${tls.minVersion}${tls.mtlsRequired ? " + mTLS (client cert required)" : ""}`;
}

/**
 * Enforce the transport-security policy before binding.
 *
 * - If ATABEY_TLS_REQUIRED=true and TLS is not configured → throw (fail closed).
 * - If binding to a non-loopback host over plaintext → throw unless
 *   ATABEY_ALLOW_INSECURE_BIND=true (prevents accidental public plaintext).
 */
export function assertTransportSecurity(
    tls: ResolvedTlsConfig,
    host: string,
    opts: { allowInsecureBind?: boolean } = {},
): void {
    if (tls.required && !tls.enabled) {
        throw new Error(
            "[TLS] ATABEY_TLS_REQUIRED=true but TLS is not configured. " +
            "Provide ATABEY_TLS_CERT_FILE / ATABEY_TLS_KEY_FILE (and ATABEY_TLS_CA_FILE for mTLS).",
        );
    }
    const normalized = host.replace(/^\[|\]$/g, "");
    const isLoopback = normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
    const allowInsecure = opts.allowInsecureBind ?? envBool("ATABEY_ALLOW_INSECURE_BIND", false);
    if (!tls.enabled && !isLoopback && !allowInsecure) {
        throw new Error(
            `[TLS] Refusing to bind plaintext HTTP to "${host}" (non-loopback). ` +
            "Configure TLS (ATABEY_TLS_CERT_FILE/KEY_FILE) or set ATABEY_ALLOW_INSECURE_BIND=true.",
        );
    }
}

/** The scheme clients should use to reach this server. */
export function tlsScheme(tls: ResolvedTlsConfig): "https" | "http" {
    return tls.enabled ? "https" : "http";
}

/** The WebSocket scheme clients should use. */
export function wsScheme(tls: ResolvedTlsConfig): "wss" | "ws" {
    return tls.enabled ? "wss" : "ws";
}
