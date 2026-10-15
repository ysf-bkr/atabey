import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                lines: 55,
                functions: 60,
                branches: 45,
                statements: 55,
            },
        },
    },
});
