import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline updated 2026-10-24 (measured: lines 61.70 /
                // funcs 73.29 / branches 51.28 / stmts 61.20) after embedding
                // provider-tagging and audit-verification tests were added. The
                // thresholds sit ~0.5-1pt below the measurements to absorb v8/Node
                // variance in CI.
                lines: 60.5,
                functions: 72,
                branches: 50,
                statements: 60,
            },
        },
    },
});
