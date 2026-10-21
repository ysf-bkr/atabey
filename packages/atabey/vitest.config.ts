import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline (current ≈ lines 60.9 / funcs 70.3 / branches 48.6 / stmts 60.1
                // after the 2026-10-20 audit: Turkish routing tests + CLI smoke tests).
                // Raise these as coverage improves.
                lines: 58,
                functions: 66,
                branches: 45,
                statements: 57,
            },
        },
    },
});
