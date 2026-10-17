# [UI/UX] Dashboard Design System & Component Standards

> **Scope:** Unified UI/UX, Component Architecture, Router DOM URL Structure, and Styling Standards for Atabey Dashboard.
> **Enforcement:** All pages and components under `packages/atabey-mcp/dashboard/` must strictly conform to these rules.

---

## 1. Core Layout Structure & Responsive Architecture

Every dashboard view is structured using a strict 3-tier layout:
```
┌────────────────────────────────────────────────────────────────────────┐
│ FIXED HEADER (h-16, z-30, backdrop-blur-xl, border-b)                 │
├───────────────┬────────────────────────────────────────────────────────┤
│ COLLAPSIBLE   │ SCROLLABLE MAIN CONTENT (flex-1, overflow-y-auto)     │
│ SIDEBAR       │ ┌────────────────────────────────────────────────────┐ │
│               │ │ 1. Page Header (Title, Subtitle, Action Buttons)   │ │
│ (w-64         │ │ 2. Stat Metric Strip (4-col grid: StatCards)       │ │
│  or w-[72px]) │ │ 3. Standard Filter / Search Bar                   │ │
│               │ │ 4. Main Data Grid / Tables / Cards                 │ │
│               │ │ 5. Standard Pagination Footer                      │ │
│               │ └────────────────────────────────────────────────────┘ │
└───────────────┴────────────────────────────────────────────────────────┘
```

### Breakpoint Matrix (From Mobile to 4K Ultra-Wide):
* **Mobile (`xs: 475px`, `sm: 640px`):** Single column layouts (`grid-cols-1`). Sidebar collapses to mobile drawer with backdrop. Tables wrapped in horizontal scroll (`overflow-x-auto`).
* **Tablets (`md: 768px`):** 2-column stat strips (`grid-cols-2`), compact header action icons.
* **Standard Desktop (`lg: 1024px`, `xl: 1280px`):** 4-column metric strips (`grid-cols-4`), 2x2 primary card grids, persistent sidebar (collapsible to 72px mini rail).
* **High-Density & Ultra-Wide (`3xl: 1920px`, `2k: 2048px`, `4k: 2560px`):** Fluid containers up to `max-w-[2560px] mx-auto`, expanded padding (`2k:p-12`), 2K grid layouts (`2k:grid-cols-2` and `2k:gap-8`).

---

## 2. Router DOM & Clean Address Bar URLs

All application pages MUST use real client-side routing via `react-router-dom`:
* `/` or `/dashboard` → Overview & System Health
* `/agents` → Specialist Agents Network & Live Agent Monitor
* `/finops` → FinOps Budget Manager & Token Economy
* `/tasks` → Task Planner DAG & Execution Logs
* `/privacy` → KVKK / GDPR Compliance & Security Gates
* `/quality` → Code Quality Gate & Architecture Compliance
* `/hermes` → Hermes Inter-Agent Message Broker & Queue Stats
* `/memory` → Vector Memory & Semantic Knowledge Base
* `/settings` → MCP Server Setup & Telemetry Streamer
* `/approvals` → Human-in-the-Loop Policy Gate & Overrides
* `*` (Catch-All) → Gracefully redirects to `/dashboard`

The address bar must always reflect the active page, enabling direct bookmarking, browser back/forward navigation, and page refreshes without losing route state.

---

## 3. Design Tokens & Palette

* **Base Canvas:** Deep Midnight `#07080e` (`bg-background`).
* **Glass Surfaces:** Semi-transparent dark `#101322` with 70% opacity + 16px blur (`glass-panel`).
* **Borders:** Subtle `rgba(255, 255, 255, 0.08)`. Hover state: `rgba(168, 85, 247, 0.35)`.
* **Brand Accents:**
  * Purple: `#8b5cf6` (Primary actions, active navigation).
  * Cyan: `#06b6d4` (Metrics, secondary highlights).
  * Emerald: `#10b981` (Success, active states).
  * Amber: `#f59e0b` (Warnings, pending states).
  * Rose: `#f43f5e` (Errors, high risk, destructive actions).
* **Typography:**
  * Body: `Inter` sans-serif (`font-sans`).
  * Code & Hashes: `JetBrains Mono` monospace (`font-mono`).

---

## 4. Standard UI Kit Primitives (Zero Raw HTML Mandate)

All views MUST use shared components from `src/components/ui`:
* **Cards:** `<Card>`, `<CardHeader>`, `<CardContent>`, `<CardFooter>`. No raw unstyled `<div>` or inline border hacks.
* **Buttons:** `<Button variant="primary | secondary | danger | ghost" size="sm | md | lg | icon">`.
* **Badges:** `<Badge variant="purple | cyan | emerald | amber | rose | neutral" size="sm | md">`.
* **Form Inputs:** `<Input>`, `<Select>`, `<Toggle>`. Labels placed above, error text below, focus ring in brand accent.
* **Tables:** `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>` with `overflow-x-auto`.
* **Feedback & States:** `<EmptyState>`, `<StatCard>`, `<PageHeader>`, `<FilterBar>`, `<Pagination>`.

---

## 5. Internationalization (i18n) Mandate

1. **Zero Hardcoded Strings:** Every button label, placeholder, card title, column header, toast message, and tooltip must use `t("key")`.
2. **100% Parity:** Every key added to `src/i18n/en.ts` MUST exist with the exact same name in `src/i18n/tr.ts`.
3. **Automated Verification:** All builds and CI checks must pass `node scripts/verify-i18n.mjs`.

---

## 6. Alert, Confirm & Toast Policy

1. **Native Browser Dialogs Forbidden:** Native `window.alert()`, `window.confirm()`, and `window.prompt()` are strictly forbidden across the codebase because they freeze execution and disrupt cybernetic UX.
2. **Standard Confirmations:** All destructive, reloading, or high-risk confirmations must use `<ConfirmDialog />`.
3. **Asynchronous Feedback:** All operation feedbacks must use `useToast()`:
   * `toast.success(message, title?)` — for successful operations.
   * `toast.error(message, title?)` — for failed API calls or network errors.
   * `toast.warning(message, title?)` — for risky or pending approvals.
   * `toast.info(message, title?)` — for background updates and refresh notices.
