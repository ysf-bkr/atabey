import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts", "mcp/tests/**/*.test.ts"],
        cache: false,
        alias: {
            "atabey-mcp/utils": path.resolve(__dirname, "./src/mcp/utils"),
            "atabey-mcp": path.resolve(__dirname, "./src"),
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline updated 2026-10-24 after adding handler tests for
                // the control plane (RBAC escalation guard + lock ownership), the
                // simple tool handlers and the atomic fs helpers.
                // Measured: lines 59.05 / funcs 66.66 / branches 50.66 / stmts 57.67.
                // Values sit ~0.5pt below the measurement so v8 coverage jitter on a
                // different Node version cannot turn a green suite red.
                lines: 57.5,
                functions: 65.5,
                branches: 49.5,
                statements: 56.5,
            },
        },
    },
});
