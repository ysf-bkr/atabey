import fs from "fs";
import http from "http";
import https from "https";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    assertTransportSecurity,
    createHttpOrHttpsServer,
    describeTls,
    resolveTlsConfig,
    tlsScheme,
    wsScheme,
} from "../src/modules/security/tls.js";

const TLS_ENV_KEYS = [
    "ATABEY_TLS_ENABLED",
    "ATABEY_TLS_CERT_FILE",
    "ATABEY_TLS_KEY_FILE",
    "ATABEY_TLS_CA_FILE",
    "ATABEY_TLS_MIN_VERSION",
    "ATABEY_MTLS_REQUIRED",
    "ATABEY_TLS_REQUIRED",
    "ATABEY_ALLOW_INSECURE_BIND",
];

describe("TLS / mTLS transport security", () => {
    let dir: string;
    let certFile: string;
    let keyFile: string;
    let caFile: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-tls-"));
        certFile = path.join(dir, "cert.pem");
        keyFile = path.join(dir, "key.pem");
        caFile = path.join(dir, "ca.pem");
        fs.writeFileSync(certFile, "-----BEGIN CERTIFICATE-----\nDUMMY\n-----END CERTIFICATE-----\n");
        fs.writeFileSync(keyFile, "-----BEGIN PRIVATE KEY-----\nDUMMY\n-----END PRIVATE KEY-----\n");
        fs.writeFileSync(caFile, "-----BEGIN CERTIFICATE-----\nDUMMY-CA\n-----END CERTIFICATE-----\n");
    });

    afterEach(() => {
        for (const k of TLS_ENV_KEYS) delete process.env[k];
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("is disabled by default (plaintext)", () => {
        const tls = resolveTlsConfig();
        expect(tls.enabled).toBe(false);
        expect(describeTls(tls)).toContain("plaintext");
        expect(tlsScheme(tls)).toBe("http");
        expect(wsScheme(tls)).toBe("ws");
    });

    it("auto-enables TLS when cert and key are provided", () => {
        process.env.ATABEY_TLS_CERT_FILE = certFile;
        process.env.ATABEY_TLS_KEY_FILE = keyFile;
        const tls = resolveTlsConfig();
        expect(tls.enabled).toBe(true);
        expect(tls.minVersion).toBe("TLSv1.3");
        expect(tls.serverOptions?.minVersion).toBe("TLSv1.3");
        expect(describeTls(tls)).toContain("TLSv1.3");
        expect(tlsScheme(tls)).toBe("https");
        expect(wsScheme(tls)).toBe("wss");
    });

    it("throws when enabled but cert/key files are missing", () => {
        process.env.ATABEY_TLS_ENABLED = "true";
        expect(() => resolveTlsConfig()).toThrow(/CERT_FILE/);
    });

    it("throws when cert file does not exist", () => {
        process.env.ATABEY_TLS_CERT_FILE = path.join(dir, "missing.pem");
        process.env.ATABEY_TLS_KEY_FILE = keyFile;
        expect(() => resolveTlsConfig()).toThrow(/not found/i);
    });

    it("rejects an invalid min version", () => {
        process.env.ATABEY_TLS_MIN_VERSION = "TLSv1.0";
        expect(() => resolveTlsConfig()).toThrow(/Invalid ATABEY_TLS_MIN_VERSION/);
    });

    it("requires a CA bundle for mTLS and sets requestCert/rejectUnauthorized", () => {
        process.env.ATABEY_TLS_CERT_FILE = certFile;
        process.env.ATABEY_TLS_KEY_FILE = keyFile;
        process.env.ATABEY_MTLS_REQUIRED = "true";
        expect(() => resolveTlsConfig()).toThrow(/CA_FILE/);

        process.env.ATABEY_TLS_CA_FILE = caFile;
        const tls = resolveTlsConfig();
        expect(tls.mtlsRequired).toBe(true);
        expect(tls.serverOptions?.requestCert).toBe(true);
        expect(tls.serverOptions?.rejectUnauthorized).toBe(true);
        expect(describeTls(tls)).toContain("mTLS");
    });

    it("returns a plain HTTP server when TLS is disabled", () => {
        const tls = resolveTlsConfig();
        const server = createHttpOrHttpsServer(tls, (_req, res) => res.end("ok"));
        expect(server instanceof http.Server).toBe(true);
        expect(server instanceof https.Server).toBe(false);
        server.close();
    });

    it("assertTransportSecurity fails closed when TLS is required but absent", () => {
        process.env.ATABEY_TLS_REQUIRED = "true";
        const tls = resolveTlsConfig();
        expect(() => assertTransportSecurity(tls, "127.0.0.1")).toThrow(/ATABEY_TLS_REQUIRED/);
    });

    it("assertTransportSecurity blocks plaintext on non-loopback hosts", () => {
        const tls = resolveTlsConfig();
        expect(() => assertTransportSecurity(tls, "0.0.0.0")).toThrow(/Refusing to bind plaintext/);
        // loopback is fine
        expect(() => assertTransportSecurity(tls, "127.0.0.1")).not.toThrow();
        // explicit opt-out is fine
        expect(() => assertTransportSecurity(tls, "0.0.0.0", { allowInsecureBind: true })).not.toThrow();
    });

    it("allows non-loopback plaintext when ATABEY_ALLOW_INSECURE_BIND=true", () => {
        process.env.ATABEY_ALLOW_INSECURE_BIND = "true";
        const tls = resolveTlsConfig();
        expect(() => assertTransportSecurity(tls, "0.0.0.0")).not.toThrow();
    });
});
