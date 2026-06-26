# 🌐 Corporate Multi-Language (i18n) Standards

This document defines the localization, internationalization, and multi-language management rules for projects managed by Agent Atabey.

## 1. Centralized Management
- **Hardcoded Forbidden:** No text visible to the user shall be written directly into the code (JSX/HTML/TS).
- **Locales Directory:** All languages are stored as JSON files under `apps/web/public/locales/` or `apps/web/src/locales/`.
- **Key-Value Standard:** Meaningful and hierarchical keys are used (e.g., `common.buttons.save`, `errors.auth.invalid_password`).
- **Single Source of Truth:** The default locale (e.g., `en`) is the canonical key set. All other locales are derived from it; orphan keys are pruned in CI.

## 2. Technical Implementation
- **i18next:** The `next-i18next` or `react-i18next` library is standard in projects.
- **Dynamic Content:** i18n interpolation (`{{name}}`) must be used for text containing variables. String concatenation to build sentences is forbidden (breaks word order in other languages).
- **Pluralization:** Singular/plural cases must be managed using the i18n library's own rules (ICU/`_plural` keys), never manual `count === 1` branching.
- **Lazy Loading:** Locale bundles are split per namespace and loaded on demand to keep the initial payload small.

## 3. Formatting and Locale Awareness
- **Dates, Numbers, Currency:** Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, and locale-aware currency formatting — never hand-rolled formatting.
- **Timezones:** Store timestamps in UTC; render in the user's locale/timezone at the presentation layer.
- **RTL Support:** Layouts must support right-to-left languages (Arabic, Hebrew) via logical CSS properties (`margin-inline-start`) and `dir="rtl"` awareness.

## 4. Accessibility and UX
- **Text Expansion:** UI must tolerate ~30-40% text growth (e.g., German, Turkish) without truncation or layout breakage.
- **Locale-Aware Sorting:** Lists are sorted with `Intl.Collator`, not byte order.

## 5. Auditing
- When the `@frontend` agent creates a new UI component, it automatically moves texts to the relevant JSON files.
- Missing translation key (missing key) checks are performed by `@quality`; a missing key in the default locale blocks merge.
- Untranslated keys in non-default locales fall back to the default locale and are reported, never shown as raw keys to users.
