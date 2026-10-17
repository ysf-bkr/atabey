import React, { createContext, useContext, useEffect, useState } from "react";
import { en, TranslationKey } from "./en";
import { tr } from "./tr";

export type Language = "tr" | "en";

interface I18nContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, tr };

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Language>(() => {
        const saved = localStorage.getItem("atabey-lang") as Language;
        if (saved === "tr" || saved === "en") return saved;
        // Default to Turkish as requested
        return "tr";
    });

    useEffect(() => {
        localStorage.setItem("atabey-lang", lang);
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = (newLang: Language) => {
        setLangState(newLang);
    };

    const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
        const dict = dictionaries[lang] || dictionaries.en;
        let text = dict[key] || dictionaries.en[key] || key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
            }
        }
        return text;
    };

    return (
        <I18nContext.Provider value={{ lang, setLang, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n(): I18nContextType {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return ctx;
}
