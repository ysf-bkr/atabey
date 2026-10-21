import path from "path";
import { defineConfig } from "vitest/config";

const fileMap: Record<string, string> = {
    database: "storage/database",
    storage: "storage/storage",
    migrations: "storage/migrations",
    "memory-prune": "storage/memory-prune",
    "policy-gate": "security/policy-gate",
    pii: "security/pii",
    secrets: "security/secrets",
    tls: "security/tls",
    retention: "security/retention",
    lock: "concurrency/lock",
    "file-lock": "concurrency/file-lock",
    "job-queue": "concurrency/job-queue",
    "worker-pool": "concurrency/worker-pool",
    "worker-thread": "concurrency/worker-thread",
    resilience: "concurrency/resilience",
    sandbox: "sandbox/sandbox",
    "sandbox-runtime": "sandbox/sandbox-runtime",
    "sandbox-fs": "sandbox/sandbox-fs",
    logger: "observability/logger",
    audit: "observability/audit",
    "audit-chain": "observability/audit-chain",
    otel: "observability/otel",
    "agent-identity": "agent/agent-identity",
    "api-catalog": "agent/api-catalog",
    tokenizer: "agent/tokenizer",
    constants: "primitives/constants",
    errors: "primitives/errors",
    fs: "primitives/fs",
    string: "primitives/string",
    time: "primitives/time",
    types: "primitives/types",
    "outbound-http": "primitives/outbound-http",
};

const aliasMap: Record<string, string> = {
    "atabey-shared": path.resolve(__dirname, "./src/index.ts"),
    "atabey-shared/modules": path.resolve(__dirname, "./src/modules"),
};
for (const [base, modPath] of Object.entries(fileMap)) {
    aliasMap[`atabey-shared/${base}.js`] = path.resolve(__dirname, `./src/modules/${modPath}.ts`);
    aliasMap[`atabey-shared/${base}`] = path.resolve(__dirname, `./src/modules/${modPath}.ts`);
}

export default defineConfig({
    resolve: {
        alias: aliasMap,
    },
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline (current ≈ lines 71.7 / funcs 82.6 / branches 58.3 / stmts 69.0
                // after the 2026-10-20 audit: direct AtabeyStorage unit tests added).
                // Raise these as coverage improves.
                lines: 68,
                functions: 78,
                branches: 56,
                statements: 66,
            },
        },
    },
});
