/**
 * Framework UI strings — English only.
 *
 * Project policy: all product content is English except the root README.md
 * (which is bilingual EN + TR). The optional `tr` key is kept only as a
 * backward-compatible alias that resolves to English strings.
 */

export type SupportedLanguage = "en" | "tr";

export interface Translations {
    welcome: string;
    select_backend: string;
    select_frontend: string;
    select_language: string;
    select_dirs: string;
    select_agents: string;
    select_palette: string;
    init_success: string;
    constitution_title: string;
    status_title: string;
    agent_ready: string;
    next_steps: string;
}

const EN: Translations = {
    welcome: "Welcome to Agent Atabey Interactive Setup!",
    select_backend: "Select Enterprise Backend Language",
    select_frontend: "Select Enterprise Frontend Framework/Build Tool",
    select_language: "Framework communication language is English",
    select_dirs: "Enter directory numbers to include (e.g. 1,2,3) or Enter for ALL:",
    select_agents: "Enter agent numbers to include (e.g. 1,2) or Enter for ALL:",
    select_palette: "Select palette (1-3) or Enter (Modern Blue):",
    init_success: "Agent Atabey initialized successfully!",
    constitution_title: "Atabey Constitution — Discipline and Order",
    status_title: "Status Board",
    agent_ready: "READY",
    next_steps: "Next Steps:",
};

/** English is the only content language; `tr` aliases to EN for CLI flag compatibility. */
export const TRANSLATIONS: Record<SupportedLanguage, Translations> = {
    en: EN,
    tr: EN,
};

/** Normalize any language flag to the content language (always English). */
export function resolveContentLanguage(_lang?: string): "en" {
    return "en";
}
