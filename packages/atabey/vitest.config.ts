import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                // Ratchet baseline (current ≈ lines 52.8 / funcs 60.5 / branches 40.3 / stmts 52.1).
                // Raise these as coverage improves.
                lines: 52,
                functions: 58,
                branches: 40,
                statements: 51,
            },
        },
    },
});
