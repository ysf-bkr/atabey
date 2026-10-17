/**
 * Atabey — Cybernetic AI Governance Design System
 * Matches docs/assets/dashboard.jpg with ultra-sleek obsidian glassmorphism,
 * neon violet/cyan gradients, and comprehensive responsive layouts for <1000px and >2000px.
 */

export const theme = {
    radius: { sm: "6px", md: "10px", lg: "16px", full: "9999px" },
    font: {
        sans: "'Inter', system-ui, -apple-system, sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace"
    },
};

export const agentStateColors: Record<string, string> = {
    READY: "var(--color-success)",
    ACTIVE: "var(--color-success)",
    EXECUTING: "var(--color-warning)",
    WAITING: "var(--color-accent-primary)",
    BLOCKED: "var(--color-error)",
    TIMEOUT: "var(--color-error)",
    BRIEFED: "var(--color-accent-primary)",
};

export const css = `
/* ─── CSS Custom Properties (Theme Colors & Tokens) ─────────────────────── */
:root {
    --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-full: 9999px;
    --sidebar-rail-width: 72px;
    --header-height: 68px;

    /* Base Palette: Deep Midnight Cybernetic Space */
    --color-bg: #07080e;
    --color-bg-secondary: #0c0e17;
    --color-surface: #101322;
    --color-surface-hover: #161a2d;
    --color-surface-active: #1c223a;
    --color-border: rgba(255, 255, 255, 0.07);
    --color-border-hover: rgba(168, 85, 247, 0.35);

    /* Text Colors */
    --color-text-primary: #f8fafc;
    --color-text-secondary: #94a3b8;
    --color-text-muted: #64748b;
    --color-heading: #ffffff;

    /* Brand Accents */
    --color-accent-primary: #8b5cf6;
    --color-accent-gradient: linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #38bdf8 100%);
    --color-accent-glow: rgba(139, 92, 246, 0.35);
    --color-cyan: #06b6d4;
    --color-cyan-glow: rgba(6, 182, 212, 0.3);
    --color-orange: #f97316;
    --color-purple: #a855f7;

    /* Semantic Status Indicators */
    --color-success: #10b981;
    --color-success-bg: rgba(16, 185, 129, 0.12);
    --color-warning: #f59e0b;
    --color-warning-bg: rgba(245, 158, 11, 0.15);
    --color-error: #ef4444;
    --color-error-bg: rgba(239, 68, 68, 0.12);
    --color-info: #38bdf8;
}

.theme-light {
    --color-bg: #f8fafc;
    --color-bg-secondary: #f1f5f9;
    --color-surface: #ffffff;
    --color-surface-hover: #f1f5f9;
    --color-surface-active: #e2e8f0;
    --color-border: rgba(0, 0, 0, 0.08);
    --color-border-hover: rgba(139, 92, 246, 0.5);
    --color-text-primary: #0f172a;
    --color-text-secondary: #475569;
    --color-text-muted: #64748b;
    --color-heading: #090d16;
}

/* ─── Global Reset & Typography ────────────────────────────────────────── */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

html, body {
    width: 100%;
    min-height: 100vh;
    background-color: var(--color-bg);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
}

#root {
    width: 100%;
    min-height: 100vh;
}

a {
    color: inherit;
    text-decoration: none;
}

/* ─── App Shell Layout ─────────────────────────────────────────────────── */
.atabey-app-shell {
    display: flex;
    min-height: 100vh;
    width: 100%;
    background-color: var(--color-bg);
    background-image: 
        radial-gradient(circle at 15% 20%, rgba(139, 92, 246, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 85% 75%, rgba(6, 182, 212, 0.04) 0%, transparent 40%);
    background-attachment: fixed;
    position: relative;
}

/* ─── Left Sidebar Dock / Rail ─────────────────────────────────────────── */
.sidebar-rail {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-rail-width);
    background-color: #080a12;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0 20px;
    z-index: 90;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.rail-top-group, .rail-bottom-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
}

.rail-icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
}

.rail-icon-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.05);
}

.rail-icon-btn.active {
    background: #6366f1;
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
}

.rail-icon-btn.active::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 20px;
    border-radius: 0 4px 4px 0;
    background: #818cf8;
}

/* ─── Main Area Container ──────────────────────────────────────────────── */
.main-area-container {
    flex: 1;
    margin-left: var(--sidebar-rail-width);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-width: 0;
    transition: margin-left 0.25s ease;
}

/* ─── Top Header Navigation ────────────────────────────────────────────── */
.top-header-bar {
    height: var(--header-height);
    padding: 0 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: blur(12px);
}

.header-brand-group {
    display: flex;
    align-items: center;
    gap: 14px;
}

.header-brand-logo {
    display: flex;
    align-items: center;
    justify-content: center;
}

.brand-text-block {
    display: flex;
    flex-direction: column;
}

.brand-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.01em;
    line-height: 1.2;
}

.brand-subtitle {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 400;
}

.header-actions-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.header-action-btn {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: #111422;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
}

.header-action-btn:hover {
    color: #ffffff;
    border-color: rgba(168, 85, 247, 0.4);
    background: #161a2c;
}

.notification-badge-dot {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
}

.header-user-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: #111422;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
}

.header-user-btn:hover {
    color: #ffffff;
    border-color: rgba(168, 85, 247, 0.4);
}

.mobile-menu-toggle {
    display: none;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: #111422;
    color: #f8fafc;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

/* ─── Main Content Viewport ────────────────────────────────────────────── */
.content-viewport {
    flex: 1;
    padding: 24px 28px 40px;
}

/* ─── Dashboard 2x2 Grid Root ──────────────────────────────────────────── */
.atabey-dashboard-root {
    width: 100%;
    position: relative;
}

.atabey-dashboard-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
}

/* ─── Common Atabey Card Design ────────────────────────────────────────── */
.atabey-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 18px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    position: relative;
    min-height: 380px;
}

.atabey-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
}

.atabey-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
}

.card-title-group {
    display: flex;
    flex-direction: column;
}

.card-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: -0.01em;
}

.card-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 3px;
    font-weight: 400;
}

.card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
}

.icon-action-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}

.icon-action-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.06);
}

.card-dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #141829;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 6px;
    min-width: 160px;
    z-index: 30;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.card-dropdown-menu button {
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #cbd5e1;
    font-size: 0.82rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
}

.card-dropdown-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
}

.filter-dropdown-wrapper {
    position: relative;
}

.filter-pill-btn {
    background: #141728;
    border: 1px solid var(--color-border);
    color: #94a3b8;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.filter-pill-btn:hover {
    border-color: rgba(168, 85, 247, 0.4);
    color: #ffffff;
}

.filter-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #141829;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 4px;
    min-width: 120px;
    z-index: 30;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.filter-menu button {
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.8rem;
    border-radius: 6px;
    cursor: pointer;
}

.filter-menu button:hover, .filter-menu button.active {
    background: rgba(99, 102, 241, 0.2);
    color: #ffffff;
}

/* ─── 1. FinOps Budget Manager Card ────────────────────────────────────── */
.finops-budget-card .finops-gauge-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 250px;
}

.gauge-wrapper {
    position: relative;
    width: 260px;
    height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gauge-svg {
    transform: rotate(0deg);
}

.gauge-center-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.gauge-label {
    font-size: 0.85rem;
    color: #94a3b8;
    font-weight: 500;
}

.gauge-value {
    font-size: 2.3rem;
    font-weight: 700;
    color: #ffffff;
    margin: 4px 0 2px;
    letter-spacing: -0.02em;
}

.gauge-subtext {
    font-size: 0.95rem;
    color: #64748b;
    font-weight: 400;
}

/* ─── 2. Specialist Agents Grid Card ───────────────────────────────────── */
.specialist-grid-card .agents-table-container {
    flex: 1;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.agents-status-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 8px;
    text-align: left;
}

.agents-status-table th {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    padding: 0 12px 6px;
}

.th-agent {
    display: flex;
    align-items: center;
    gap: 4px;
}

.sort-arrow {
    font-size: 0.85rem;
    color: #94a3b8;
}

.agent-row {
    background: rgba(18, 22, 38, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.agent-row:hover {
    background: rgba(26, 31, 54, 0.8);
}

.agent-row td {
    padding: 12px;
    vertical-align: middle;
    font-size: 0.85rem;
}

.agent-row td:first-child {
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
}

.agent-row td:last-child {
    border-top-right-radius: 10px;
    border-bottom-right-radius: 10px;
}

.td-expand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 10px;
}

.status-indicator-bar {
    width: 3px;
    height: 22px;
    border-radius: 2px;
    background: #10b981;
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    flex-shrink: 0;
}

.expand-chevron {
    color: #64748b;
    display: flex;
    align-items: center;
}

.agent-badge-name {
    display: flex;
    align-items: center;
    gap: 10px;
}

.agent-avatar-icon {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #1a2035;
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    flex-shrink: 0;
}

.agent-handle {
    font-weight: 600;
    color: #f8fafc;
}

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
}

.status-active {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.25);
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
}

.desc-text {
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
    display: block;
}

.activity-text {
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    display: block;
}

.agent-expanded-detail-row td {
    padding: 0 12px 12px;
}

.expanded-detail-box {
    background: #0d101c;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.detail-item {
    font-size: 0.8rem;
    display: flex;
    gap: 6px;
}

.detail-key {
    color: #64748b;
}

.detail-val {
    color: #cbd5e1;
    font-weight: 500;
}

.small-btn {
    padding: 4px 10px;
    font-size: 0.75rem;
    background: #1a2038;
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.small-btn:hover {
    background: #232c4e;
    color: #ffffff;
}

/* ─── 3. Daily LLM Token Costs Card ────────────────────────────────────── */
.token-costs-card .chart-legend-row {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: #94a3b8;
}

.legend-pill {
    width: 12px;
    height: 4px;
    border-radius: 2px;
}

.legend-line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
}

.legend-box {
    width: 10px;
    height: 10px;
    border-radius: 2px;
}

.chart-svg-container {
    position: relative;
    width: 100%;
    flex: 1;
    min-height: 220px;
}

.token-chart-svg {
    overflow: visible;
}

.info-icon {
    display: inline-flex;
    color: #64748b;
    cursor: pointer;
    margin-left: 4px;
}

.info-icon:hover {
    color: #94a3b8;
}

.chart-tooltip {
    position: absolute;
    transform: translate(-50%, -100%);
    background: #141728;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.75rem;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.tooltip-title {
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 4px;
}

.tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: #94a3b8;
}

/* ─── 4. PII Masking & Compliance Card ─────────────────────────────────── */
.live-telemetry-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.25);
    color: #10b981;
    font-size: 0.75rem;
    font-weight: 500;
}

.telemetry-live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
    animation: pulseGlow 2s infinite ease-in-out;
}

@keyframes pulseGlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
}

.pii-stats-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
}

.pii-mini-card {
    background: rgba(18, 22, 38, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
}

.pii-mini-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.status-success-icon {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
}

.status-indigo-icon {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
}

.pii-mini-content {
    display: flex;
    flex-direction: column;
}

.pii-mini-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #ffffff;
    line-height: 1.2;
}

.pii-mini-desc {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-top: 2px;
}

.metric-highlight {
    color: #ffffff;
    font-weight: 700;
}

.pii-log-stream-container {
    background: #080a13;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 12px 16px;
    flex: 1;
    min-height: 160px;
    max-height: 200px;
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    line-height: 1.7;
}

.pii-log-stream-container::-webkit-scrollbar {
    width: 4px;
}
.pii-log-stream-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
}

.log-line {
    display: flex;
    align-items: baseline;
    gap: 12px;
    white-space: nowrap;
}

.log-timestamp {
    color: #38bdf8;
    opacity: 0.9;
    flex-shrink: 0;
}

.log-text {
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ─── 5. Approval Center Modal (Human-in-the-Loop) ─────────────────────── */
.hitl-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 12, 0.65);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

.hitl-modal-card {
    background: #141728;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    width: 100%;
    max-width: 450px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.75);
    overflow: hidden;
    animation: hitlScaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes hitlScaleIn {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}

.hitl-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px 14px;
}

.hitl-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
}

.hitl-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin: 3px 0 0;
}

.hitl-close-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
}

.hitl-close-btn:hover {
    color: #ffffff;
}

.hitl-toast {
    margin: 0 24px 12px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #10b981;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 6px;
}

.hitl-inner-card {
    padding: 0 24px 24px;
}

.hitl-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.hitl-trace-id {
    font-size: 0.82rem;
    color: #94a3b8;
    font-family: var(--font-mono);
}

.hitl-status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 6px;
}

.status-pending {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-approved {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-rejected {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.hitl-action-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 16px;
    letter-spacing: -0.01em;
}

.hitl-risk-box {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    background: rgba(10, 12, 22, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 16px;
}

.risk-col {
    display: flex;
    flex-direction: column;
}

.risk-label {
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
}

.risk-desc-item {
    font-size: 0.8rem;
    color: #cbd5e1;
}

.risk-key {
    color: #64748b;
    margin-right: 4px;
}

.hitl-sub-actions-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
}

.sub-action-btn {
    background: #1c2136;
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
}

.sub-action-btn:hover {
    background: #252b48;
    color: #ffffff;
}

.hitl-primary-actions-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 18px;
}

.hitl-btn-approve {
    background: var(--color-accent-gradient);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    padding: 12px 16px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(99, 102, 241, 0.4);
    transition: all 0.2s;
}

.hitl-btn-approve:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.6);
}

.hitl-btn-reject {
    background: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: 10px;
    padding: 12px 16px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
}

.hitl-btn-reject:hover {
    background: rgba(239, 68, 68, 0.12);
}

.floating-hitl-trigger {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #141728;
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 9999px;
    padding: 10px 18px;
    color: #f59e0b;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    z-index: 99;
    transition: all 0.2s;
}

.floating-hitl-trigger:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 36px rgba(245, 158, 11, 0.3);
}

.hitl-pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 8px #f59e0b;
    animation: pulseGlow 1.5s infinite ease-in-out;
}

/* ─── Drawer & Modules Menu (Preserving All 18 Specialist Views) ────────── */
.modules-drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: 95;
}

.modules-drawer {
    position: fixed;
    top: 0;
    left: var(--sidebar-rail-width);
    bottom: 0;
    width: 280px;
    background: #0b0d18;
    border-right: 1px solid var(--color-border);
    z-index: 96;
    display: flex;
    flex-direction: column;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.5);
    animation: slideRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideRight {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
}

.modules-drawer-header {
    padding: 18px 20px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modules-drawer-header h3 {
    font-size: 1rem;
    color: #ffffff;
    font-weight: 600;
}

.modules-drawer-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
}

.drawer-module-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
}

.drawer-module-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
}

.drawer-module-btn.active {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    font-weight: 600;
}

/* ─── Generic Card Fallbacks for Deep-Dive Views ───────────────────────── */
.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    padding: 20px 24px;
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.card-header h2 {
    font-size: 1.15rem;
    font-weight: 600;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
}

.badge {
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 0.75rem;
    color: #94a3b8;
}

.list-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.list-item {
    background: rgba(18, 22, 38, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    padding: 12px 14px;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
    margin-bottom: 4px;
}

.detail-label {
    color: #64748b;
}

.detail-value {
    color: #cbd5e1;
}

.btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    border: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.btn-primary {
    background: #6366f1;
    color: #ffffff;
}

.btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.empty-state {
    text-align: center;
    padding: 32px;
    color: #64748b;
}

.error {
    color: #ef4444;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 8px;
}

/* ─── Animations ───────────────────────────────────────────────────────── */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
    animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* ═════════════════════════════════════════════════════════════════════════
   RESPONSIVE DESIGN SPECIFICATIONS (<1000px, 1000px-2000px, >2000px)
   ═════════════════════════════════════════════════════════════════════════ */

/* ─── 1. Screens Lower than 1000px (< 1k: Tablets & Mobiles) ──────────── */
@media (max-width: 999px) {
    :root {
        --sidebar-rail-width: 0px;
    }

    .sidebar-rail {
        transform: translateX(-100%);
        width: 72px;
    }

    .sidebar-rail.open {
        transform: translateX(0);
    }

    .main-area-container {
        margin-left: 0;
    }

    .mobile-menu-toggle {
        display: flex;
    }

    .top-header-bar {
        padding: 0 16px;
    }

    .content-viewport {
        padding: 16px;
    }

    .atabey-dashboard-grid {
        grid-template-columns: 1fr;
        gap: 16px;
    }

    .atabey-card {
        padding: 18px;
        min-height: auto;
    }

    .pii-stats-row {
        grid-template-columns: 1fr;
    }

    .hitl-modal-card {
        max-width: 95vw;
        margin: 12px;
    }

    .hitl-action-title {
        font-size: 1.1rem;
    }

    .hitl-risk-box {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .desc-text {
        max-width: 140px;
    }

    .activity-text {
        max-width: 100px;
    }
}

/* ─── 2. Small Mobile Screens (< 640px) ────────────────────────────────── */
@media (max-width: 639px) {
    .brand-title {
        font-size: 1rem;
    }
    .brand-subtitle {
        display: none;
    }
    .header-actions-group {
        gap: 8px;
    }
    .chart-legend-row {
        gap: 10px;
    }
    .gauge-wrapper {
        width: 220px;
        height: 220px;
    }
    .gauge-value {
        font-size: 1.8rem;
    }
}

/* ─── 3. Standard Screens (1000px - 1999px) ────────────────────────────── */
@media (min-width: 1000px) and (max-width: 1999px) {
    .atabey-dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
    }
}

/* ─── 4. Screens Larger than 2000px (> 2k: 2K QHD, 4K UHD, Ultrawide) ──── */
@media (min-width: 2000px) {
    :root {
        --sidebar-rail-width: 84px;
        --header-height: 80px;
    }

    body {
        font-size: 16px;
    }

    .atabey-dashboard-root {
        max-width: 2600px;
        margin: 0 auto;
    }

    .atabey-dashboard-grid {
        gap: 28px;
    }

    .atabey-card {
        border-radius: 22px;
        padding: 32px 36px;
        min-height: 440px;
    }

    .card-title {
        font-size: 1.35rem;
    }

    .card-subtitle {
        font-size: 0.9rem;
    }

    .brand-title {
        font-size: 1.35rem;
    }

    .brand-subtitle {
        font-size: 0.85rem;
    }

    .gauge-wrapper {
        width: 320px;
        height: 320px;
    }

    .gauge-value {
        font-size: 3rem;
    }

    .gauge-label {
        font-size: 1rem;
    }

    .gauge-subtext {
        font-size: 1.1rem;
    }

    .chart-svg-container {
        min-height: 280px;
    }

    .desc-text {
        max-width: 360px;
        font-size: 0.95rem;
    }

    .activity-text {
        max-width: 240px;
        font-size: 0.95rem;
    }

    .agent-row td {
        padding: 16px 14px;
        font-size: 0.95rem;
    }

    .hitl-modal-card {
        max-width: 520px;
    }
}
`;
