/**
 * ⚠️ DEPRECATED — Active use is minimal.
 * The project communicates in English by default (see ATABEY.md LANGUAGE POLICY).
 * Preserved for potential future i18n expansion.
 */

export type SupportedLanguage = "tr" | "en";

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

export const TRANSLATIONS: Record<SupportedLanguage, Translations> = {
    tr: {
        welcome: "Agent Atabey İnteraktif Kuruluma Hoş Geldiniz!",
        select_backend: "Kurumsal Backend Dilini Seçin",
        select_frontend: "Kurumsal Frontend Altyapısını Seçin",
        select_language: "Framework İletişim Dilini Seçin",
        select_dirs: "Dahil edilecek framework dizinlerini seçin (örn: 1,2,3) veya HEPSİ için Enter:",
        select_agents: "Dahil edilecek çekirdek ajanları seçin (örn: 1,2) veya HEPSİ için Enter:",
        select_palette: "Renk paletini seçin (1-3) veya Enter (Modern Blue):",
        init_success: "Agent Atabey başarıyla kuruldu!",
        constitution_title: "Atabey Anayasası — Disiplin ve Nizam",
        status_title: "Durum Çizelgesi",
        agent_ready: "HAZIR",
        next_steps: "Sonraki Adımlar:",
    },
    en: {
        welcome: "Welcome to Agent Atabey Interactive Setup!",
        select_backend: "Select Enterprise Backend Language",
        select_frontend: "Select Enterprise Frontend Framework/Build Tool",
        select_language: "Select Framework Communication Language",
        select_dirs: "Enter directory numbers to include (e.g. 1,2,3) or Enter for ALL:",
        select_agents: "Enter agent numbers to include (e.g. 1,2) or Enter for ALL:",
        select_palette: "Select palette (1-3) or Enter (Modern Blue):",
        init_success: "Agent Atabey initialized successfully!",
        constitution_title: "Atabey Constitution — Discipline and Order",
        status_title: "Status Board",
        agent_ready: "READY",
        next_steps: "Next Steps:",
    }
};
