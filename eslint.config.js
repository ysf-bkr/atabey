import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const styleRules = {
    indent: ["error", 4, { SwitchCase: 1 }],
    "linebreak-style": "off",
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "no-constant-condition": "warn",
};

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "framework-mcp/dist/**",

            ".agent/**",
            ".gemini/**",
            ".claude/**",
            ".cursor/**",
            ".atabey/**",
            "panda.config.ts",
            "test-installations/**",
            "apps/**",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.{ts,tsx}", "framework-mcp/src/**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                project: ["./tsconfig.json", "./framework-mcp/tsconfig.json"],
                tsconfigRootDir: import.meta.dirname,
            },

        },
        rules: {
            ...styleRules,
            "no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        },
    },
    { // NEW CONFIG BLOCK FOR src/dashboard
        files: ["src/dashboard/**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2021,
                // Add browser globals if needed for React context
                // ...globals.browser,
            },
            parserOptions: {
                project: ["./src/dashboard/tsconfig.json"], // Point to the dashboard's tsconfig
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...styleRules,
            // Any specific rules for the dashboard can go here
            "no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        },
    },
    { // NEW CONFIG BLOCK FOR src/dashboard/vite.config.ts
        files: ["src/dashboard/vite.config.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                project: ["./src/dashboard/tsconfig.node.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...styleRules,
            "no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["tests/**/*.{ts,tsx}", "framework-mcp/tests/**/*.{ts,tsx}", "vitest.config.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                project: ["./tsconfig.json", "./framework-mcp/tsconfig.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...styleRules,
            "no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            ...styleRules,
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
);
