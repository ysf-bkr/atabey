/**
 * Centralized language / framework / platform selection for `atabey init`.
 *
 * These lists are the single source of truth shared by:
 *  - the interactive init prompts (init.ts)
 *  - the non-interactive `--yes` mode with CLI flags (--backend/--frontend/--native)
 *  - config.json persistence (scaffold-core.ts)
 *
 * Keep every entry here canonical. The `normalize*` helpers accept loose user
 * input (case-insensitive, aliases) and map it to a canonical entry so that
 * `--backend go`, `--backend Go`, and `--backend golang` all resolve to "Go".
 */

/** Backend application-tier languages. */
export const BACKEND_LANGUAGES = [
    "Node.js (TypeScript)",
    "Go",
    "Java (Spring Boot)",
    "Python (FastAPI)",
    ".NET",
    "Rust",
] as const;

/** Frontend frameworks. */
export const FRONTEND_FRAMEWORKS = [
    "Vite (React)",
    "Next.js (App Router)",
    "Vanilla HTML/JS",
] as const;

/**
 * Native / platform-layer languages. Per project policy the platform tier is
 * Rust or Go only — TypeScript is forbidden for OS-level / FFI / hot-path code.
 */
export const NATIVE_LANGUAGES = [
    "Rust",
    "Go",
] as const;

export const DEFAULT_BACKEND_LANGUAGE: string = "Node.js (TypeScript)";
export const DEFAULT_FRONTEND_FRAMEWORK: string = "Vite (React)";
export const DEFAULT_NATIVE_LANGUAGE: string = "Rust";

/** Maps loose backend aliases to canonical BACKEND_LANGUAGES entries. */
function canonicalBackend(input: string): string | undefined {
    const s = input.trim().toLowerCase();
    const table: Record<string, string> = {
        "node": "Node.js (TypeScript)",
        "node.js": "Node.js (TypeScript)",
        "node.js (typescript)": "Node.js (TypeScript)",
        "typescript": "Node.js (TypeScript)",
        "ts": "Node.js (TypeScript)",
        "go": "Go",
        "golang": "Go",
        "java": "Java (Spring Boot)",
        "java (spring boot)": "Java (Spring Boot)",
        "spring": "Java (Spring Boot)",
        "spring boot": "Java (Spring Boot)",
        "python": "Python (FastAPI)",
        "python (fastapi)": "Python (FastAPI)",
        "fastapi": "Python (FastAPI)",
        ".net": ".NET",
        "net": ".NET",
        "c#": ".NET",
        "csharp": ".NET",
        "dotnet": ".NET",
        "rust": "Rust",
    };
    return table[s];
}

/** Maps loose frontend aliases to canonical FRONTEND_FRAMEWORKS entries. */
function canonicalFrontend(input: string): string | undefined {
    const s = input.trim().toLowerCase();
    const table: Record<string, string> = {
        "vite": "Vite (React)",
        "vite (react)": "Vite (React)",
        "react": "Vite (React)",
        "next": "Next.js (App Router)",
        "next.js": "Next.js (App Router)",
        "next.js (app router)": "Next.js (App Router)",
        "nextjs": "Next.js (App Router)",
        "vanilla": "Vanilla HTML/JS",
        "vanilla html/js": "Vanilla HTML/JS",
        "html": "Vanilla HTML/JS",
    };
    return table[s];
}

/** Maps loose native aliases to canonical NATIVE_LANGUAGES entries. */
function canonicalNative(input: string): string | undefined {
    const s = input.trim().toLowerCase();
    const table: Record<string, string> = {
        "rust": "Rust",
        "go": "Go",
        "golang": "Go",
    };
    return table[s];
}

/**
 * Resolves user input to a canonical backend language.
 * Falls back to the default when the input is missing or unrecognized.
 */
export function normalizeBackendLanguage(input: string | undefined): string {
    if (!input) return DEFAULT_BACKEND_LANGUAGE;
    return canonicalBackend(input) ?? DEFAULT_BACKEND_LANGUAGE;
}

/** Resolves user input to a canonical frontend framework (falls back to default). */
export function normalizeFrontendFramework(input: string | undefined): string {
    if (!input) return DEFAULT_FRONTEND_FRAMEWORK;
    return canonicalFrontend(input) ?? DEFAULT_FRONTEND_FRAMEWORK;
}

/** Resolves user input to a canonical native language (falls back to Rust). */
export function normalizeNativeLanguage(input: string | undefined): string {
    if (!input) return DEFAULT_NATIVE_LANGUAGE;
    return canonicalNative(input) ?? DEFAULT_NATIVE_LANGUAGE;
}
