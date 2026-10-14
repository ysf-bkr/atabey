import {
    Activity,
    AlertTriangle,
    Ban,
    BarChart3,
    Bell,
    Bot,
    Brain,
    CheckCircle,
    CircleHelp,
    Cpu,
    DollarSign,
    GitBranch,
    LayoutDashboard,
    Layers,
    LogOut,
    Menu,
    MessageSquare,
    Moon,
    Plug,
    ScrollText,
    Server,
    Settings,
    ShieldCheck,
    Sun,
    User,
    Users,
    Wifi,
    X
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { AdapterSkillsPanel } from "./components/AdapterSkillsPanel";
import { AgentMonitor } from "./components/AgentMonitor";
import { ApprovalCenter } from "./components/ApprovalCenter";
import { AtabeyDashboard } from "./components/AtabeyDashboard";
import { CompliancePanel } from "./components/CompliancePanel";
import { DisciplinePanel } from "./components/DisciplinePanel";
import { ErrorTracker } from "./components/ErrorTracker";
import { FinOpsPanel } from "./components/FinOpsPanel";
import { HermesBrokerView } from "./components/HermesBrokerView";
import { HermesStats } from "./components/HermesStats";
import { LogViewer } from "./components/LogViewer";
import { LoopDetectorPanel } from "./components/LoopDetectorPanel";
import { MCPSetupPanel } from "./components/MCPSetupPanel";
import { MemoryInsights } from "./components/MemoryInsights";
import { PlanViewer } from "./components/PlanViewer";
import { PrivacyPanel } from "./components/PrivacyPanel";
import { QualityPanel } from "./components/QualityPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { TokenEconomyPanel } from "./components/TokenEconomyPanel";
import { useWS } from "./hooks/useWS";
import { useI18n } from "./i18n";
import { css } from "./styles";

// Full list of 19 specialized modules (accessible via Drawer / Deep Dive)
const ALL_MODULES = [
    { id: "dashboard", label: "Dashboard", Component: null, icon: LayoutDashboard },
    { id: "agents", label: "Specialists Grid", Component: AgentMonitor, icon: Bot },
    { id: "finops", label: "FinOps Budget", Component: FinOpsPanel, icon: DollarSign },
    { id: "privacy", label: "PII & Privacy", Component: PrivacyPanel, icon: ShieldCheck },
    { id: "telemetry", label: "Telemetry Logs", Component: TelemetryPanel, icon: Wifi },
    { id: "tokens", label: "Token Economy", Component: TokenEconomyPanel, icon: Cpu },
    { id: "approvals", label: "HITL Approvals", Component: ApprovalCenter, icon: ShieldCheck },
    { id: "hermes", label: "Hermes Stats", Component: HermesStats, icon: BarChart3 },
    { id: "messages", label: "Message Broker", Component: HermesBrokerView, icon: MessageSquare },
    { id: "tasks", label: "Task Planner", Component: PlanViewer, icon: GitBranch },
    { id: "logs", label: "Execution Logs", Component: LogViewer, icon: ScrollText },
    { id: "quality", label: "Code Quality", Component: QualityPanel, icon: Activity },
    { id: "compliance", label: "Gate Compliance", Component: CompliancePanel, icon: CheckCircle },
    { id: "memory", label: "Vector Memory", Component: MemoryInsights, icon: Brain },
    { id: "discipline", label: "Discipline Rules", Component: DisciplinePanel, icon: Ban },
    { id: "errors", label: "Policy Exceptions", Component: ErrorTracker, icon: AlertTriangle },
    { id: "mcp", label: "MCP Setup", Component: MCPSetupPanel, icon: Server },
    { id: "adapters", label: "Skill Adapters", Component: AdapterSkillsPanel, icon: Plug },
    { id: "loop", label: "Loop Detection", Component: LoopDetectorPanel, icon: Ban },
];

export default function App() {
    const { t, lang, setLang } = useI18n();
    const [activeTab, setActiveTab] = useState("dashboard");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [modulesDrawerOpen, setModulesDrawerOpen] = useState(false);
    const [approvalModalOpen, setApprovalModalOpen] = useState(true);
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        return (localStorage.getItem("atabey-theme") as "dark" | "light") || "dark";
    });

    const wsConnected = useWS();

    useEffect(() => {
        document.documentElement.classList.remove("theme-dark", "theme-light");
        document.documentElement.classList.add(`theme-${theme}`);
    }, [theme]);

    const toggleTheme = () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        localStorage.setItem("atabey-theme", next);
    };

    const currentModule = ALL_MODULES.find(m => m.id === activeTab) || ALL_MODULES[0];
    const ActiveComponent = currentModule.Component;

    return (
        <>
            <style>{css}</style>

            <div className="atabey-app-shell">
                {/* Mobile Drawer Overlay */}
                {mobileMenuOpen && (
                    <div
                        className="modules-drawer-overlay"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                )}

                {/* Left Sidebar Icon Rail (Matches dashboard.jpg exactly) */}
                <aside className={`sidebar-rail ${mobileMenuOpen ? "open" : ""}`}>
                    {/* Top Group: Dashboard, Specialists, Stats, Settings */}
                    <div className="rail-top-group">
                        <button
                            className={`rail-icon-btn ${activeTab === "dashboard" ? "active" : ""}`}
                            onClick={() => { setActiveTab("dashboard"); setMobileMenuOpen(false); }}
                            title="Dashboard Overview"
                        >
                            <LayoutDashboard size={20} />
                        </button>

                        <button
                            className={`rail-icon-btn ${activeTab === "agents" ? "active" : ""}`}
                            onClick={() => { setActiveTab("agents"); setMobileMenuOpen(false); }}
                            title="Active Specialist Agents"
                        >
                            <Users size={20} />
                        </button>

                        <button
                            className={`rail-icon-btn ${activeTab === "telemetry" || activeTab === "hermes" ? "active" : ""}`}
                            onClick={() => { setActiveTab("telemetry"); setMobileMenuOpen(false); }}
                            title="Telemetry & Analytics"
                        >
                            <BarChart3 size={20} />
                        </button>

                        <button
                            className={`rail-icon-btn ${modulesDrawerOpen ? "active" : ""}`}
                            onClick={() => setModulesDrawerOpen(!modulesDrawerOpen)}
                            title="All Modules & Settings"
                        >
                            <Settings size={20} />
                        </button>
                    </div>

                    {/* Bottom Group: Help & Logout */}
                    <div className="rail-bottom-group">
                        <button
                            className="rail-icon-btn"
                            title="Documentation & Help"
                            onClick={() => window.open("https://github.com/ysf-bkr/atabey", "_blank")}
                        >
                            <CircleHelp size={20} />
                        </button>

                        <button
                            className="rail-icon-btn"
                            title="Exit / Reset State"
                            onClick={() => {
                                if (confirm("Reload Hermes Control Plane?")) {
                                    window.location.reload();
                                }
                            }}
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </aside>

                {/* Secondary Modules Drawer (to access all 19 deep dive tools) */}
                {modulesDrawerOpen && (
                    <>
                        <div
                            className="modules-drawer-overlay"
                            onClick={() => setModulesDrawerOpen(false)}
                        />
                        <div className="modules-drawer">
                            <div className="modules-drawer-header">
                                <h3>Control Plane Modules</h3>
                                <button
                                    className="icon-action-btn"
                                    onClick={() => setModulesDrawerOpen(false)}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="modules-drawer-list">
                                {ALL_MODULES.map(m => {
                                    const Icon = m.icon;
                                    return (
                                        <button
                                            key={m.id}
                                            className={`drawer-module-btn ${activeTab === m.id ? "active" : ""}`}
                                            onClick={() => {
                                                setActiveTab(m.id);
                                                setModulesDrawerOpen(false);
                                                setMobileMenuOpen(false);
                                            }}
                                        >
                                            <Icon size={16} />
                                            <span>{m.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* Main Content Area */}
                <div className="main-area-container">
                    {/* Top Header Bar */}
                    <header className="top-header-bar">
                        {/* Brand Logo & Title */}
                        <div className="header-brand-group">
                            <button
                                className="mobile-menu-toggle"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                title="Toggle Menu"
                            >
                                <Menu size={20} />
                            </button>

                            <div
                                className="header-brand-logo"
                                onClick={() => setActiveTab("dashboard")}
                                style={{ cursor: "pointer" }}
                            >
                                <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
                                    <defs>
                                        <linearGradient id="atabeyBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#c026d3" />
                                            <stop offset="45%" stopColor="#8b5cf6" />
                                            <stop offset="100%" stopColor="#06b6d4" />
                                        </linearGradient>
                                    </defs>
                                    <path
                                        d="M17.5 4C14.2 4 11.5 6.8 10.8 10L6.2 25.8C5.6 27.9 7.2 30 9.4 30C11.1 30 12.6 28.7 13 27L14.2 22.8H21.8L23 27C23.4 28.7 24.9 30 26.6 30C28.8 30 30.4 27.9 29.8 25.8L25.2 10C24.5 6.8 21.8 4 17.5 4ZM18 10.5C18.9 10.5 19.7 11.2 19.9 12.1L21.2 18.2H14.8L16.1 12.1C16.3 11.2 17.1 10.5 18 10.5Z"
                                        fill="url(#atabeyBrandGrad)"
                                    />
                                </svg>
                            </div>

                            <div
                                className="brand-text-block"
                                onClick={() => setActiveTab("dashboard")}
                                style={{ cursor: "pointer" }}
                            >
                                <h1 className="brand-title">Agent Atabey</h1>
                                <span className="brand-subtitle">AI Governance framework</span>
                            </div>
                        </div>

                        {/* Header Actions (Language, Theme, Notification Bell, Avatar) */}
                        <div className="header-actions-group">
                            {/* Live WebSocket Status Dot */}
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    padding: "4px 9px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    borderRadius: "16px",
                                    background: wsConnected ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                    color: wsConnected ? "#10b981" : "#f59e0b",
                                    border: `1px solid ${wsConnected ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                                }}
                                title={wsConnected ? "Live WebSocket Connected" : "Connecting..."}
                            >
                                <Wifi size={12} />
                                <span>{wsConnected ? "LIVE" : "SYNC"}</span>
                            </span>

                            {/* Language Switcher Toggle */}
                            <button
                                className="filter-pill-btn"
                                onClick={() => setLang(lang === "tr" ? "en" : "tr")}
                                title={t("nav.language")}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "20px" }}
                            >
                                <span>{lang === "tr" ? "🇹🇷 TR" : "🇬🇧 EN"}</span>
                            </button>

                            {/* Theme Toggle Button */}
                            <button
                                className="header-action-btn"
                                onClick={toggleTheme}
                                title={theme === "dark" ? t("nav.theme.light") : t("nav.theme.dark")}
                            >
                                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                            </button>

                            {/* Notification Bell with Red Badge Dot -> Toggles HITL Modal */}
                            <button
                                className="header-action-btn"
                                onClick={() => setApprovalModalOpen(true)}
                                title={t("hitl.title")}
                            >
                                <Bell size={18} />
                                <span className="notification-badge-dot" />
                            </button>

                            {/* User Avatar Button */}
                            <button
                                className="header-user-btn"
                                title="Security Profile & Sessions"
                                onClick={() => setModulesDrawerOpen(true)}
                            >
                                <User size={18} />
                            </button>
                        </div>
                    </header>

                    {/* Viewport Content */}
                    <main className="content-viewport">
                        {activeTab === "dashboard" ? (
                            <AtabeyDashboard
                                onNavigate={(tabId) => setActiveTab(tabId)}
                                showApprovalModal={approvalModalOpen}
                                onToggleApprovalModal={setApprovalModalOpen}
                            />
                        ) : (
                            <div className="focused-module-view animate-fade-in">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <button
                                            className="filter-pill-btn"
                                            onClick={() => setActiveTab("dashboard")}
                                        >
                                            ← Back to Dashboard
                                        </button>
                                        <h2 style={{ fontSize: "1.25rem", color: "#ffffff", margin: 0 }}>
                                            {currentModule.label}
                                        </h2>
                                    </div>
                                    <button
                                        className="filter-pill-btn"
                                        onClick={() => setModulesDrawerOpen(true)}
                                    >
                                        <Layers size={14} />
                                        <span>All Modules</span>
                                    </button>
                                </div>

                                {ActiveComponent && <ActiveComponent />}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </>
    );
}
