import {
    Activity,
    AlertTriangle,
    Ban,
    BarChart3,
    BookOpen,
    Bot,
    Brain,
    CheckCircle,
    Cpu,
    DollarSign,
    ExternalLink,
    GitBranch,
    Github,
    LayoutDashboard,
    Lock,
    Menu,
    MessageSquare,
    Moon,
    Plug,
    ScrollText,
    Server,
    ShieldCheck,
    Sun,
    Unlock,
    Wifi,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AdapterSkillsPanel } from "./components/AdapterSkillsPanel";
import { AgentMonitor } from "./components/AgentMonitor";
import { ApprovalCenter } from "./components/ApprovalCenter";
import { CompliancePanel } from "./components/CompliancePanel";
import { DisciplinePanel } from "./components/DisciplinePanel";
import { ErrorTracker } from "./components/ErrorTracker";
import { FinOpsPanel } from "./components/FinOpsPanel";
import { HermesBrokerView } from "./components/HermesBrokerView";
import { HermesStats } from "./components/HermesStats";
import { LicensePanel } from "./components/LicensePanel";
import { LogViewer } from "./components/LogViewer";
import { LoopDetectorPanel } from "./components/LoopDetectorPanel";
import { MCPSetupPanel } from "./components/MCPSetupPanel";
import { MemoryInsights } from "./components/MemoryInsights";
import { PlanViewer } from "./components/PlanViewer";
import { PrivacyPanel } from "./components/PrivacyPanel";
import { QualityPanel } from "./components/QualityPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { TokenEconomyPanel } from "./components/TokenEconomyPanel";
import { useApi } from "./hooks/useApi";
import { useWS } from "./hooks/useWS";
import { css } from "./styles";

interface AgentInfo {
    name: string;
    state: string;
    task: string;
    last_updated: string;
}

interface HermesStatsInfo {
    total: number;
    pending: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    lastMessage: unknown;
}

interface ApprovalInfo {
    id: string;
    traceId: string;
    description: string;
    status: string;
    timestamp: string;
}

interface ComplianceInfo {
    summary: {
        totalFiles: number;
        totalViolations: number;
        byType: Record<string, number>;
    };
    violations: unknown[];
}

const TABS = [
    { id: "dashboard",  label: "Overview",       Component: null,             desc: "Governance Overview",          icon: LayoutDashboard },
    { id: "agents",     label: "Specialists",    Component: AgentMonitor,     desc: "13 Governed Specialists",      icon: Bot },
    { id: "hermes",     label: "Hermes",         Component: HermesStats,      desc: "Message Queue Stats",          icon: BarChart3 },
    { id: "messages",   label: "Audit Trail",    Component: HermesBrokerView, desc: "Hermes Message Queue",          icon: MessageSquare },
    { id: "approvals",  label: "HITL Gates",     Component: ApprovalCenter,   desc: "Human-in-the-Loop Gates",      icon: ShieldCheck },
    { id: "tasks",      label: "Tasks",          Component: PlanViewer,       desc: "Task Planning & DAG",          icon: GitBranch },
    { id: "logs",       label: "Execution",      Component: LogViewer,        desc: "Specialist Execution Logs",    icon: ScrollText },
    { id: "quality",    label: "Quality",        Component: QualityPanel,     desc: "Code Quality Analysis",        icon: Activity },
    { id: "errors",     label: "Exceptions",     Component: ErrorTracker,     desc: "Policy & Audit Exceptions",    icon: AlertTriangle },
    { id: "memory",     label: "Memory",         Component: MemoryInsights,   desc: "Vector Memory Search",         icon: Brain },
    { id: "compliance", label: "Compliance",     Component: CompliancePanel,  desc: "Quality Gate Status",          icon: CheckCircle },
    { id: "finops",     label: "FinOps",         Component: FinOpsPanel,      desc: "Budget & Cost Management",     icon: DollarSign },
    { id: "loop",       label: "Loop Detector",  Component: LoopDetectorPanel, desc: "Loop Prevention & Cooldowns", icon: Ban },
    { id: "license",    label: "License",        Component: LicensePanel,     desc: "SPDX & Copyleft Scanner",      icon: BookOpen },
    { id: "telemetry",  label: "Telemetry",      Component: TelemetryPanel,   desc: "Edge-to-Cloud Streaming",      icon: Wifi },
    { id: "privacy",    label: "GDPR / KVKK",    Component: PrivacyPanel,     desc: "GDPR & KVKK Compliance",       icon: ShieldCheck },
    { id: "discipline", label: "Discipline",     Component: DisciplinePanel,  desc: "AI Discipline & Rules",        icon: Ban },
    { id: "mcp",        label: "MCP Setup",      Component: MCPSetupPanel,    desc: "MCP Configuration",            icon: Server },
    { id: "adapters",   label: "Adapters",       Component: AdapterSkillsPanel, desc: "Adapter-Skill Mapping",       icon: Plug },
    { id: "tokens",     label: "Token Econ",     Component: TokenEconomyPanel, desc: "Token Economy & Cost",         icon: Cpu },
];

const TAB_ICONS: Record<string, typeof Bot> = {};
TABS.forEach(t => { TAB_ICONS[t.id] = t.icon; });

interface DashboardOverviewProps {
    onNavigate: (tabId: string) => void;
}

const ALL_AGENT_NAMES = [
    "manager", "security", "architect", "backend", "frontend", "quality",
    "database", "analyst", "mobile", "native", "devops", "explorer", "git"
];

function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
    const { data: agents } = useApi<AgentInfo[]>("/agents", 5000);
    const { data: queueStats } = useApi<HermesStatsInfo>("/hermes/stats", 5000);
    const { data: approvals } = useApi<ApprovalInfo[]>("/approvals", 5000);
    const { data: compliance } = useApi<ComplianceInfo>("/compliance?path=src", 10000);

    const activeAgentsCount = Array.isArray(agents) ? agents.filter(a => a.state !== "READY" && a.state !== "Idle").length : 0;
    const totalAgentsCount = ALL_AGENT_NAMES.length;
    const pendingMessages = queueStats?.pending ?? 0;
    const pendingApprovalsCount = Array.isArray(approvals) ? approvals.filter(a => a.status === "PENDING").length : 0;
    const totalViolations = compliance?.summary?.totalViolations ?? 0;

    const { data: privacyStats } = useApi<{ stats: { total: number; byAction: Record<string, number>; byCategory: Record<string, number> } }>("/audit", 10000);
    const piiMaskedCount = privacyStats?.stats?.byAction?.["MASK_PII"] || privacyStats?.stats?.byAction?.["PII_MASKED"] || 0;
    const piiDetectedCount = privacyStats?.stats?.byAction?.["PII_DETECTED"] || 0;
    const restrictedCount = privacyStats?.stats?.byCategory?.["RESTRICTED"] || 0;

    const { data: metricsData } = useApi<{ totalToolCalls: number; totalEstimatedTokens: number; totalEstimatedCost: number }>("/metrics", 10000);
    const totalToolCalls = metricsData?.totalToolCalls ?? 0;
    const totalEstimatedTokens = metricsData?.totalEstimatedTokens ?? 0;
    const totalEstimatedCost = metricsData?.totalEstimatedCost ?? 0;

    const { data: mcpSessions } = useApi<{ total: number }>("/mcp/sessions", 10000);
    const activeSessions = mcpSessions?.total ?? 0;

    // Discipline stats
    const { data: disciplineData } = useApi<Record<string, { violations: number; totalCalls: number; inCooldown: boolean }>>("/discipline", 10000);
    const totalViolationsCount = Object.values(disciplineData || {}).reduce((s: number, v: Record<string, unknown>) => s + ((v.violations as number) || 0), 0);
    const inCooldown = Object.values(disciplineData || {}).some((v: Record<string, unknown>) => v.inCooldown);

    return (
        <div className="dashboard-overview animate-fade-in">
            <div className="hero-banner">
                <div className="hero-title-group">
                    <h1>Governance Plane</h1>
                    <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", opacity: 0.8 }}>
                        Governance Engine: <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Active</span> | Policy Target: <span style={{ color: "var(--color-highlight)", fontWeight: 600 }}>Phase 0 Enforced</span>
                    </p>
                </div>
                <div className="hero-meta">
                    <span className="hero-badge">v0.0.20</span>
                </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-secondary)", letterSpacing: "0.08em", marginBottom: "0.75rem", borderLeft: "3px solid var(--color-accent-primary)", paddingLeft: "8px", fontWeight: 700 }}>
                    Active Session & Specialist Status
                </h3>
                <div className="quick-stats-grid">
                    <div className="stat-card clickable" onClick={() => onNavigate("agents")}>
                        <div className="stat-card-header"><Bot size={18} className="stat-icon" /><span className="stat-title">Specialists</span></div>
                        <div className="stat-card-value">{activeAgentsCount} / {totalAgentsCount}</div>
                        <div className="stat-card-desc">Governed specialist nodes active</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("hermes")}>
                        <div className="stat-card-header"><BarChart3 size={18} className="stat-icon" /><span className="stat-title">Hermes Queue</span></div>
                        <div className="stat-card-value">{pendingMessages}</div>
                        <div className="stat-card-desc">Pending messages in transit</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("approvals")} style={{
                        borderColor: pendingApprovalsCount > 0 ? "var(--color-accent-primary)" : undefined,
                        background: pendingApprovalsCount > 0 ? "var(--color-accent-glow)" : undefined
                    }}>
                        <div className="stat-card-header"><ShieldCheck size={18} className="stat-icon" /><span className="stat-title">HITL Gates</span></div>
                        <div className="stat-card-value" style={{ color: pendingApprovalsCount > 0 ? "var(--color-accent-primary)" : undefined }}>{pendingApprovalsCount}</div>
                        <div className="stat-card-desc">{pendingApprovalsCount > 0 ? "Manual overrides pending" : "All gates clear"}</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("mcp")}>
                        <div className="stat-card-header"><Server size={18} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">MCP Server</span></div>
                        <div className="stat-card-value" style={{ color: "var(--color-accent-primary)", fontSize: "1.1rem" }}>{activeSessions > 0 ? `${activeSessions} session(s)` : "Ready"}</div>
                        <div className="stat-card-desc">{activeSessions > 0 ? "AI clients connected" : "Waiting for AI clients"}</div>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-secondary)", letterSpacing: "0.08em", marginBottom: "0.75rem", borderLeft: "3px solid var(--color-accent-primary)", paddingLeft: "8px", fontWeight: 700 }}>
                    AI Policy & Governance Gates
                </h3>
                <div className="quick-stats-grid">
                    <div className="stat-card clickable" onClick={() => onNavigate("compliance")}>
                        <div className="stat-card-header"><CheckCircle size={18} className="stat-icon" /><span className="stat-title">Gate Auditing</span></div>
                        <div className="stat-card-value" style={{ color: totalViolations > 0 ? "var(--color-warning)" : undefined }}>{totalViolations}</div>
                        <div className="stat-card-desc">Quality Gate violations</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("privacy")} style={{ borderColor: piiDetectedCount > 0 ? "var(--color-accent-primary)" : undefined }}>
                        <div className="stat-card-header"><ShieldCheck size={18} style={{ color: "var(--color-accent-primary)" }} /><span className="stat-title">GDPR / KVKK</span></div>
                        <div className="stat-card-value" style={{ color: "var(--color-accent-primary)", fontSize: "1.1rem" }}>{piiMaskedCount > 0 ? `${piiMaskedCount} masked` : "Active"}</div>
                        <div className="stat-card-desc">{piiDetectedCount > 0 ? `${piiDetectedCount} PII · ${restrictedCount} restricted` : "PII masking active"}</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("discipline")} style={{ borderColor: inCooldown ? "var(--color-warning)" : undefined }}>
                        <div className="stat-card-header"><Ban size={18} style={{ color: totalViolationsCount > 0 ? "var(--color-error)" : "var(--color-success)" }} /><span className="stat-title">Discipline</span></div>
                        <div className="stat-card-value" style={{ color: totalViolationsCount > 0 ? "var(--color-error)" : "var(--color-success)", fontSize: "1.1rem" }}>
                            {totalViolationsCount > 0 ? `${totalViolationsCount} violations` : "All Clean"}
                        </div>
                        <div className="stat-card-desc">{inCooldown ? "Agent(s) in cooldown" : "All agents compliant"}</div>
                    </div>

                    <div className="stat-card clickable" onClick={() => onNavigate("tokens")} style={{ borderColor: totalEstimatedCost > 0.1 ? "var(--color-warning)" : undefined }}>
                        <div className="stat-card-header"><Cpu size={18} style={{ color: "var(--color-accent-muted)" }} /><span className="stat-title">Token Economy</span></div>
                        <div className="stat-card-value" style={{ color: "var(--color-accent-muted)", fontSize: "1.1rem" }}>{totalToolCalls > 0 ? `${totalToolCalls} calls` : "Active"}</div>
                        <div className="stat-card-desc">{totalEstimatedTokens > 0 ? `${(totalEstimatedTokens / 1000).toFixed(1)}K tokens · ~$${totalEstimatedCost.toFixed(2)}` : "Tracking tool call metrics"}</div>
                    </div>
                </div>
            </div>

            <div className="overview-sections-layout">
                <div className="overview-left-column">
                    <AgentMonitor />
                    <ApprovalCenter />
                </div>
                <div className="overview-right-column">
                    <HermesStats />
                    <LogViewer />
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        const saved = localStorage.getItem("atabey-theme");
        return (saved as "dark" | "light") || "dark";
    });
    const [authToken, setAuthTokenState] = useState(() => localStorage.getItem("atabey-auth-token") || "");
    const saveAuthToken = (val: string) => {
        localStorage.setItem("atabey-auth-token", val);
        setAuthTokenState(val);
    };
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

    const activeTabObj = TABS.find(t => t.id === activeTab) || TABS[0];
    const ActiveComponent = activeTabObj.Component;

    return (
        <>
            <style>{css}</style>
            <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
            <div className="app-shell">
                <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
                    <div className="sidebar-header"><span className="sidebar-logo">[ATABEY]</span></div>
                    <nav className="sidebar-nav">
                        {TABS.map(t => {
                            const Icon = t.icon;
                            return (
                                <button key={t.id} className={`sidebar-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => { setActiveTab(t.id); setSidebarOpen(false); }} title={t.desc}>
                                    <Icon /><span className="sidebar-label">{t.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                    <div className="sidebar-footer">
                        <div className="ws-indicator">
                            <span className="ws-dot" style={{ background: wsConnected ? "var(--color-success)" : "var(--color-error)", boxShadow: wsConnected ? "0 0 6px var(--color-success)" : "none" }} />
                            {wsConnected ? "WS Live" : "WS Offline"}
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.6 }}>Atabey Governance Engine v0.0.20</div>
                    </div>
                </aside>
                <div className="main-area">
                    <header className="main-header">
                        <div className="main-header-left">
                            <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                                {sidebarOpen ? <X /> : <Menu />}
                            </button>
                            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, fontSize: "0.95rem" }}>
                                <span style={{ opacity: 0.85 }}>Hermes Control Center</span>
                                <span style={{ opacity: 0.4 }}>/</span>
                                <span style={{ color: "var(--color-accent-primary)", fontWeight: 600 }}>{activeTabObj.label}</span>
                            </span>
                        </div>
                        <div className="main-header-right">
                            <div className="auth-token-input-wrapper" style={{ position: "relative" }}>
                                {authToken ? (
                                    <Lock size={12} style={{ position: "absolute", left: "6px", top: "50%", transform: "translateY(-50%)", color: "var(--color-success)" }} />
                                ) : (
                                    <Unlock size={12} style={{ position: "absolute", left: "6px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
                                )}
                                <input
                                    type="password"
                                    placeholder="MCP Token..."
                                    className="auth-token-input"
                                    value={authToken}
                                    onChange={(e) => saveAuthToken(e.target.value)}
                                    title="Enter MCP_AUTH_TOKEN if configured"
                                />
                            </div>
                            <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} style={{ marginRight: "0.5rem" }}>
                                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                            <span className="badge">{TABS.length - 1} modules</span>
                            <a href="/api/health" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                                <ExternalLink size={14} /> API
                            </a>
                            <a href="https://github.com/ysf-bkr/atabey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                                <Github size={14} /> GitHub
                            </a>
                        </div>
                    </header>
                    <main className="main-content">
                        {activeTab === "dashboard" ? (
                            <DashboardOverview onNavigate={(tabId) => setActiveTab(tabId)} />
                        ) : (
                            <div className="focused-view animate-fade-in">
                                {ActiveComponent && <ActiveComponent />}
                            </div>
                        )}
                    </main>
                    <footer className="main-footer">{TABS.length - 1} Modules Live · Port {window.location.port || "5858"}</footer>
                </div>
            </div>
        </>
    );
}
