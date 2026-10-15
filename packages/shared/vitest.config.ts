import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "json-summary"],
            thresholds: {
                lines: 70,
                functions: 75,
                branches: 55,
                statements: 70,
            },
        },
    },
});
