/**
 * Hermes Control Center — Central Style File
 * Red & Black Theme + Light/Dark Mode Custom Properties
 * Single source of truth, zero repetition.
 */

export const theme = {
    radius: { sm: "4px", md: "8px", lg: "12px", full: "9999px" },
    font: { mono: "'JetBrains Mono', 'Fira Code', monospace" },
};

export const agentStateColors: Record<string, string> = {
    READY: "var(--color-success)",
    EXECUTING: "var(--color-warning)",
    WAITING: "var(--color-accent-primary)",
    BLOCKED: "var(--color-error)",
    TIMEOUT: "var(--color-error)",
    BRIEFED: "var(--color-accent-primary)",
};

export const css = `
/* ─── CSS Variables (Light/Dark Themes) ────────────── */
:root {
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-full: 9999px;
    --sidebar-width: 230px;

    /* Light Theme (White & Red Accent) */
    --color-bg: #f9f9fb;
    --color-surface: #ffffff;
    --color-border: #e4e4e7;
    --color-border-hover: rgba(193, 18, 31, 0.5);
    --color-text-primary: #09090b;
    --color-text-secondary: #4b5563;
    --color-text-muted: #9ca3af;
    --color-accent-primary: #c1121f;
    --color-accent-hover: #780000;
    --color-accent-glow: rgba(193, 18, 31, 0.08);
    --color-sidebar-bg: #18181b;
    --color-sidebar-text: #a1a1aa;
    --color-sidebar-hover: #27272a;
    --color-sidebar-active: #2b1114;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;
    --color-info: #3b82f6;
    --color-dim: #71717a;
    --color-text-soft: #71717a;
    --color-heading: #18181b;
    --color-code-bg: #f4f4f5;
    --color-code-border: #e4e4e7;
    --color-label: #71717a;
    --color-highlight: #c1121f;
    --color-accent-muted: #8b5cf6;
}

.theme-dark {
    /* Dark Theme (Pure Black & Red Accent) */
    --color-bg: #000000;
    --color-surface: #060608;
    --color-border: #141416;
    --color-border-hover: rgba(255, 0, 60, 0.6);
    --color-text-primary: #f4f4f5;
    --color-text-secondary: #a1a1aa;
    --color-text-muted: #52525b;
    --color-accent-primary: #ff003c;
    --color-accent-hover: #ff3366;
    --color-accent-glow: rgba(255, 0, 60, 0.12);
    --color-sidebar-bg: #030303;
    --color-sidebar-text: #71717a;
    --color-sidebar-hover: #0f0f12;
    --color-sidebar-active: #1c0006;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;
    --color-info: #3b82f6;
    --color-dim: #71717a;
    --color-text-soft: #a1a1aa;
    --color-heading: #f4f4f5;
    --color-code-bg: #09090b;
    --color-code-border: #18181b;
    --color-label: #a1a1aa;
    --color-highlight: #ff003c;
    --color-accent-muted: #a78bfa;
}

/* ─── Reset & Base ─────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
body {
    margin: 0;
    font-family: 'Inter', system-ui, Avenir, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    font-weight: 400;
    color: var(--color-text-primary);
    background: var(--color-bg);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    transition: background-color 0.3s ease, color 0.3s ease;
}
#root { width: 100%; min-height: 100vh; }
a { color: var(--color-accent-primary); text-decoration: none; transition: color 0.2s; }
a:hover { color: var(--color-accent-hover); text-decoration: underline; }

/* ─── App Shell ────────────────────────────────────── */
.app-shell {
    display: flex;
    min-height: 100vh;
    width: 100%;
}

/* ─── Sidebar ──────────────────────────────────────── */
.sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--color-sidebar-bg);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: transform 0.25s ease, background-color 0.3s ease, border-color 0.3s ease;
    overflow: hidden;
}
.sidebar-header {
    padding: 1rem 1rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 56px;
}
.sidebar-logo {
    color: var(--color-accent-primary);
    font-weight: 800;
    font-size: 1.1rem;
    white-space: nowrap;
    letter-spacing: 0.05em;
}
.sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
}
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-track { background: transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
.sidebar-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    color: var(--color-sidebar-text);
    cursor: pointer;
    font-size: 0.85rem;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-left: 3px solid transparent;
    white-space: nowrap;
}
.sidebar-btn:hover {
    background: var(--color-sidebar-hover);
    color: var(--color-text-primary);
    padding-left: 1.25rem;
}
.sidebar-btn.active {
    background: var(--color-sidebar-active);
    color: var(--color-accent-primary);
    border-left-color: var(--color-accent-primary);
    font-weight: 600;
}
.sidebar-btn svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
}
.sidebar-label {
    overflow: hidden;
    text-overflow: ellipsis;
}
.sidebar-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.75rem;
    color: var(--color-text-muted);
}
.ws-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
}
.ws-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
}

/* ─── Main Content Area ────────────────────────────── */
.main-area {
    flex: 1;
    margin-left: var(--sidebar-width);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--color-bg);
    transition: margin-left 0.25s ease, background-color 0.3s ease;
}
.main-header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 50;
    transition: background-color 0.3s ease, border-color 0.3s ease;
}
.main-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.main-header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.85rem;
}
.auth-token-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-right: 0.5rem;
}
.auth-token-input {
    padding: 0.35rem 0.65rem 0.35rem 1.65rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-primary);
    font-size: 0.75rem;
    width: 100px;
    outline: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.auth-token-input:focus {
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 8px var(--color-accent-glow);
    width: 160px;
}
.menu-toggle {
    display: none;
    background: none;
    border: none;
    color: var(--color-text-primary);
    cursor: pointer;
    padding: 4px;
}
.menu-toggle svg {
    width: 22px;
    height: 22px;
}
.main-content {
    flex: 1;
    padding: 1.5rem;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
}
.main-footer {
    text-align: center;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    transition: border-color 0.3s ease;
}

/* ─── Dashboard Grid ───────────────────────────────── */
.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
    gap: 1.5rem;
}
.dashboard-grid .card-full {
    grid-column: 1 / -1;
}

/* ─── Hero Banner ──────────────────────────────────── */
.hero-banner {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.1) 0%, rgba(15, 23, 42, 0.25) 100%);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 1.5rem 2rem;
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    backdrop-filter: blur(10px);
    transition: border-color 0.3s ease;
}
.theme-dark .hero-banner {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(0, 0, 0, 0.8) 100%);
}
.hero-title-group h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text-primary);
    background: linear-gradient(to right, var(--color-text-primary), var(--color-accent-primary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.hero-title-group p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
}
.hero-badge {
    background: var(--color-accent-glow);
    color: var(--color-accent-primary);
    border: 1px solid var(--color-border);
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-full);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.05em;
}

/* ─── Quick Stats Grid ──────────────────────────────── */
.quick-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
}
.stat-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.stat-card.clickable {
    cursor: pointer;
}
.stat-card.clickable:hover {
    border-color: var(--color-border-hover);
    transform: translateY(-3px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}
.theme-dark .stat-card.clickable:hover {
    box-shadow: 0 8px 25px rgba(239, 68, 68, 0.15);
}
.stat-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
}
.stat-icon {
    font-size: 1.2rem;
}
.stat-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.stat-card-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.1;
    margin-bottom: 0.35rem;
}
.stat-card-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

/* ─── Focused View ─────────────────────────────────── */
.focused-view {
    width: 100%;
}
.focused-view .card {
    margin-bottom: 0;
}

/* ─── Card System ──────────────────────────────────── */
.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease, background-color 0.3s ease;
}
.card:hover {
    border-color: var(--color-border-hover);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
}
.theme-dark .card:hover {
    box-shadow: 0 10px 30px rgba(239, 68, 68, 0.08);
}
.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
}
.card-header h2 {
    margin: 0;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-primary);
}
.card-header h2 svg {
    width: 20px;
    height: 20px;
    color: var(--color-accent-primary);
    flex-shrink: 0;
}
.badge {
    background: var(--color-border);
    color: var(--color-text-secondary);
    padding: 2px 10px;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    white-space: nowrap;
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* ─── Shared Utilities ─────────────────────────────── */
.flex-col-gap-8 { display: flex; flex-direction: column; gap: 0.5rem; }
.flex-row-gap-8 { display: flex; gap: 0.5rem; }
.flex-row-gap-4 { display: flex; gap: 0.25rem; }
.flex-space-between { display: flex; justify-content: space-between; align-items: center; }
.flex-align-center { display: flex; align-items: center; gap: 0.5rem; }
.margin-bottom-6 { margin-bottom: 0.35rem; }
.margin-bottom-12 { margin-bottom: 0.75rem; }
.font-semibold { font-weight: 600; }
.font-mono { font-family: var(--font-mono); }
.text-sm { font-size: 0.85rem; }
.text-xs { font-size: 0.75rem; }
.text-xxs { font-size: 0.65rem; }
.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-muted { color: var(--color-text-muted); }
.text-accent { color: var(--color-accent-primary); }

/* ─── Search input ─────────────────────────────────── */
.search-input {
    flex: 1;
    padding: 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-primary);
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.2s;
}
.search-input:focus {
    border-color: var(--color-accent-primary);
}

/* ─── Adapter Panel ────────────────────────────────── */
.adapter-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.adapter-item {
    padding: 10px 12px;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-accent-primary);
    transition: transform 0.2s ease, border-color 0.2s ease;
}
.adapter-item:hover {
    transform: translateX(2px);
    border-color: var(--color-border-hover);
}
.adapter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}
.adapter-name {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 6px;
}
.adapter-name svg {
    color: var(--color-accent-primary);
}
.adapter-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
}
.adapter-skills-grid {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}
.skill-badge {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--color-accent-glow);
    color: var(--color-accent-primary);
    font-size: 0.7rem;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 1px solid rgba(239, 68, 68, 0.1);
}

/* ─── Agent Grid ───────────────────────────────────── */
.agent-list-container {
    max-height: 380px;
    overflow-y: auto;
    padding-right: 4px;
}
.agent-list-container::-webkit-scrollbar { width: 6px; }
.agent-list-container::-webkit-scrollbar-track { background: var(--color-bg); }
.agent-list-container::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
.agent-list-container::-webkit-scrollbar-thumb:hover { background: var(--color-border-hover); }

.agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
}
.agent-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
}
.agent-card:hover { border-color: var(--color-accent-primary); transform: translateY(-1px); }
.agent-card.expanded { border-color: var(--color-accent-primary); }
.agent-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.agent-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.agent-dot.ready { background: var(--color-success); box-shadow: 0 0 6px var(--color-success); }
.agent-dot.executing { background: var(--color-warning); box-shadow: 0 0 6px var(--color-warning); }
.agent-dot.waiting { background: var(--color-accent-primary); box-shadow: 0 0 6px var(--color-accent-primary); }
.agent-dot.blocked { background: var(--color-error); box-shadow: 0 0 6px var(--color-error); }
.agent-dot.timeout { background: var(--color-error); box-shadow: 0 0 6px var(--color-error); }
.agent-dot.briefed { background: var(--color-accent-primary); box-shadow: 0 0 6px var(--color-accent-primary); }
.agent-name { font-weight: 600; flex: 1; font-size: 0.9rem; color: var(--color-text-primary); }
.agent-state {
    padding: 2px 8px; border-radius: 10px;
    font-size: 0.7rem; font-weight: 600; white-space: nowrap;
}

/* ─── Agent Monitor status ─────────────────────────── */
.agent-state.ready { background: rgba(34, 197, 94, 0.1); color: var(--color-success); border: 1px solid rgba(34, 197, 94, 0.2); }
.agent-state.executing { background: rgba(234, 179, 8, 0.1); color: var(--color-warning); border: 1px solid rgba(234, 179, 8, 0.2); }
.agent-state.waiting { background: var(--color-accent-glow); color: var(--color-accent-primary); border: 1px solid rgba(239, 68, 68, 0.2); }
.agent-state.blocked { background: rgba(239, 68, 68, 0.1); color: var(--color-error); border: 1px solid rgba(239, 68, 68, 0.2); }
.agent-state.timeout { background: rgba(239, 68, 68, 0.1); color: var(--color-error); border: 1px solid rgba(239, 68, 68, 0.2); }
.agent-state.briefed { background: var(--color-accent-glow); color: var(--color-accent-primary); border: 1px solid rgba(239, 68, 68, 0.2); }

/* ─── Detail Rows ──────────────────────────────────── */
.detail-row { display: flex; gap: 0.5rem; font-size: 0.85rem; margin-top: 0.5rem; }
.detail-label { color: var(--color-text-secondary); min-width: 80px; flex-shrink: 0; }
.detail-value { color: var(--color-text-primary); word-break: break-word; }
.trace-id { font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text-muted); }

/* ─── Status Colors ────────────────────────────────── */
.status-ready { color: var(--color-success); }
.status-executing { color: var(--color-warning); }
.status-waiting { color: var(--color-accent-primary); }
.status-blocked { color: var(--color-error); }
.status-timeout { color: var(--color-error); }
.status-briefed { color: var(--color-accent-primary); }
.status-pending { color: var(--color-warning); }
.status-approved { color: var(--color-success); }
.status-rejected { color: var(--color-error); }
.status-processed { color: var(--color-text-muted); }

/* ─── List item modifiers ────────────────────────── */
.list-item.approved, .list-item.rejected, .list-item.processed {
    opacity: 0.6;
}

/* ─── Compliance Panel ─────────────────────────────── */
.compliance-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
}
.compliance-file {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--color-text-primary);
}
.compliance-status {
    font-size: 0.75rem;
    font-weight: 600;
}
.compliance-status.pass { color: var(--color-success); }
.compliance-status.fail { color: var(--color-error); }
.compliance-violations {
    margin-top: 8px;
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
}
.compliance-violation {
    font-size: 0.8rem;
    color: var(--color-error);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}

/* ─── Error Tracker ────────────────────────────────── */
.badge.has-errors {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-accent-primary);
    border: 1px solid rgba(239, 68, 68, 0.3);
}
.search-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
    align-items: center;
}
.search-bar label {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
}

/* ─── Memory Insights ──────────────────────────────── */
.memory-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
}
.memory-tag {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.65rem;
    background: var(--color-border);
    color: var(--color-text-secondary);
}
.memory-text {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    word-break: break-word;
    line-height: 1.5;
}

/* ─── Plan Viewer ──────────────────────────────────── */
.task-header {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 0.8rem;
}
.task-agent {
    color: var(--color-accent-primary);
    font-weight: 500;
}
.task-status-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.65rem;
}
.task-status-badge.pending { background: rgba(234, 179, 8, 0.1); color: var(--color-warning); }
.task-status-badge.in_progress { background: var(--color-accent-glow); color: var(--color-accent-primary); }
.task-status-badge.completed { background: rgba(34, 197, 94, 0.1); color: var(--color-success); }
.task-status-badge.blocked, .task-status-badge.failed { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
.task-details {
    margin-top: 8px;
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
    font-size: 0.8rem;
}

/* ─── Buttons ──────────────────────────────────────── */
.btn {
    padding: 0.5rem 1rem; font-size: 0.85rem;
    border-radius: var(--radius-sm); cursor: pointer;
    transition: all 0.2s; border: none; font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}
.btn svg { width: 16px; height: 16px; }
.btn-primary { background: var(--color-accent-primary); color: white; }
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-danger { background: var(--color-error); color: white; }
.btn-danger:hover { background: #dc2626; }
.btn-ghost {
    background: transparent; color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
}
.btn-ghost:hover { background: var(--color-border); }

/* ─── Theme Toggle Button ──────────────────────────── */
.theme-toggle-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}
.theme-toggle-btn:hover {
    border-color: var(--color-accent-primary);
    background: var(--color-accent-glow);
}

/* ─── Filter Tabs ──────────────────────────────────── */
.filter-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.filter-tab {
    padding: 4px 10px; font-size: 0.75rem;
    border-radius: var(--radius-sm); cursor: pointer;
    border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-secondary);
    transition: all 0.2s;
}
.filter-tab.active { background: var(--color-border); color: var(--color-accent-primary); border-color: var(--color-accent-primary); }

/* ─── Lists ────────────────────────────────────────── */
.list-container {
    display: flex; flex-direction: column; gap: 0.5rem;
    max-height: 450px; overflow-y: auto;
}
.list-container::-webkit-scrollbar { width: 6px; }
.list-container::-webkit-scrollbar-track { background: var(--color-bg); }
.list-container::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
.list-container::-webkit-scrollbar-thumb:hover { background: var(--color-border-hover); }
.list-item {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); padding: 0.75rem;
    transition: all 0.2s;
}
.list-item:hover { border-color: var(--color-accent-primary); }

/* ─── Stats ────────────────────────────────────────── */
.stats-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.75rem; margin: 0.75rem 0;
}
.stat-box {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); padding: 0.75rem;
    text-align: center;
}
.stat-box.pass { border-left: 3px solid var(--color-success); }
.stat-box.fail { border-left: 3px solid var(--color-error); }
.stat-box.warn { border-left: 3px solid var(--color-warning); }
.stat-box.info { border-left: 3px solid var(--color-accent-primary); }
.list-item.task-item.pending { border-left: 3px solid var(--color-warning); }
.list-item.task-item.in_progress { border-left: 3px solid var(--color-accent-primary); }
.list-item.task-item.completed { border-left: 3px solid var(--color-success); }
.list-item.task-item.blocked, .list-item.task-item.failed { border-left: 3px solid var(--color-error); }
.stat-count { display: block; font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); }
.stat-label { font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

/* ─── Toast ────────────────────────────────────────── */
.toast {
    padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
    margin-bottom: 0.75rem; font-size: 0.85rem;
    animation: toastIn 0.3s ease-out;
}
.toast-success { background: rgba(34,197,94,0.1); border: 1px solid var(--color-success); color: var(--color-success); }
.toast-error { background: rgba(239,68,68,0.1); border: 1px solid var(--color-error); color: var(--color-error); }
@keyframes toastIn { from { opacity: 0; transform: translateY(-0.5rem); } to { opacity: 1; transform: translateY(0); } }

/* ─── Empty State ──────────────────────────────────── */
.empty-state { text-align: center; padding: 2rem; color: var(--color-text-muted); }

/* ─── Error ────────────────────────────────────────── */
.error { color: var(--color-error); font-size: 0.9rem; }

/* ─── Responsive ───────────────────────────────────── */
@media (max-width: 1023px) {
    .sidebar {
        transform: translateX(-100%);
        width: var(--sidebar-width);
    }
    .sidebar.open {
        transform: translateX(0);
    }
    .sidebar-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99;
    }
    .sidebar-overlay.open {
        display: block;
    }
    .main-area {
        margin-left: 0;
    }
    .menu-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
}
@media (min-width: 1024px) {
    .sidebar-overlay {
        display: none !important;
    }
}
@media (max-width: 640px) {
    .main-header {
        padding: 0.5rem 1rem;
    }
    .main-content {
        padding: 1rem;
    }
    .card {
        padding: 1rem;
    }
    .agent-grid {
        grid-template-columns: 1fr;
    }
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    .main-header-right {
        font-size: 0.75rem;
        gap: 0.5rem;
    }
}

/* ─── Split-Pane Overview Columns ───────────────────── */
.overview-sections-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
}
.overview-left-column, .overview-right-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}
@media (max-width: 1199px) {
    .overview-sections-layout {
        grid-template-columns: 1fr;
    }
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
    animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
`;
