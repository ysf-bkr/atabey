import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts", "framework-mcp/tests/**/*.test.ts"],
        cache: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            // Phased coverage targets — ROADMAP goal: 100% for framework-mcp.
            // Progression: 40 (baseline) → 70/60 (v0.0.16) → 80/70 → 90/80 → 100.
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 60,
                statements: 70,
            },
        },
    },
});
