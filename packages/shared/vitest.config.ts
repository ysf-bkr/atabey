import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline (current ≈ lines 64.8 / funcs 80.2 / branches 56.7 / stmts 62.8).
                // Raise these as coverage improves.
                lines: 63,
                functions: 78,
                branches: 55,
                statements: 62,
            },
        },
    },
});
