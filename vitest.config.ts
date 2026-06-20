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
            thresholds: {
                lines: 40,
                functions: 40,
                branches: 40,
                statements: 40,
            },
        },
    },
});
