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
                lines: 70,
                functions: 70,
                branches: 60,
                statements: 70,
            },
        },
    },
});
