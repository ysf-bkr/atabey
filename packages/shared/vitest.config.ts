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
                // Ratchet baseline updated 2026-10-24 after adding tests for the
                // approvals/costs storage facade and the atomic fs primitives.
                // Measured: lines 71.11 / funcs 81.02 / branches 60.51 / stmts 68.28.
                lines: 70,
                functions: 80,
                branches: 59,
                statements: 67.5,
            },
        },
    },
});
