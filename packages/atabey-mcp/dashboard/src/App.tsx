import React, { useEffect, useState } from "react";
import type { TranslationKey } from "./i18n/en";
import { Activity, AlertTriangle, Ban, BarChart3, Bot, Brain, CheckCircle, CircleHelp, Cpu, DollarSign, GitBranch, Globe, LayoutDashboard, Menu, MessageSquare, Moon, PanelLeftClose, PanelLeftOpen, Plug, RefreshCw, ScrollText, Server, ShieldAlert, ShieldCheck, Sun, Wifi, X } from "lucide-react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

// Page Views
import { OverviewPage } from "./pages/OverviewPage";
import { AgentsPage } from "./pages/AgentsPage";
import { FinOpsPage } from "./pages/FinOpsPage";
import { SecurityPrivacyPage } from "./pages/SecurityPrivacyPage";
import { QualityCompliancePage } from "./pages/QualityCompliancePage";
import { HermesPage } from "./pages/HermesPage";
import { MemoryPage } from "./pages/MemoryPage";
import { TasksPage } from "./pages/TasksPage";
import { SettingsPage } from "./pages/SettingsPage";

// Direct Component Views for Secondary Tabs
import { ApprovalCenter } from "./components/ApprovalCenter";
import { ApprovalCenterModal, ApprovalItem } from "./components/ApprovalCenterModal";
import { CompliancePanel } from "./components/CompliancePanel";
import { DisciplinePanel } from "./components/DisciplinePanel";
import { ErrorTracker } from "./components/ErrorTracker";
import { HermesBrokerView } from "./components/HermesBrokerView";
import { LogViewer } from "./components/LogViewer";
import { LoopDetectorPanel } from "./components/LoopDetectorPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { TokenCostsChartCard } from "./components/TokenCostsChartCard";
import { TokenEconomyPanel } from "./components/TokenEconomyPanel";
import { AdapterSkillsPanel } from "./components/AdapterSkillsPanel";

// UI Primitives
import { Badge, Button, ConfirmDialog, useToast } from "./components/ui";
import { useWS } from "./hooks/useWS";
import { useI18n } from "./i18n";
import { useApi } from "./hooks/useApi";
import { css } from "./styles";

interface NavModule {
  id: string;
  path: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  badge?: string | number;
}

interface NavCategory {
  titleKey: string;
  items: NavModule[];
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("atabey-sidebar-collapsed") === "true";
  });
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("atabey-theme") as "dark" | "light") || "dark";
  });

  const wsConnected = useWS();
  const { data: serverApprovals } = useApi<ApprovalItem[]>("/approvals", 4000);

  const pendingApprovals = Array.isArray(serverApprovals)
    ? serverApprovals.filter((a) => a.status.toUpperCase() === "PENDING").length
    : 0;

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("atabey-theme", next);
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("atabey-sidebar-collapsed", String(next));
  };

  // Structured Menu with 4 clear categories for all Control Plane Modules with real URLs
  const navCategories: NavCategory[] = [
    {
      titleKey: "nav.cat.core",
      items: [
        { id: "dashboard", path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
        { id: "agents", path: "/agents", labelKey: "nav.specialists", icon: Bot, badge: "13" },
        { id: "tasks", path: "/tasks", labelKey: "nav.tasks", icon: GitBranch },
        { id: "logs", path: "/logs", labelKey: "nav.logs", icon: ScrollText },
      ],
    },
    {
      titleKey: "nav.cat.governance",
      items: [
        {
          id: "approvals",
          path: "/approvals",
          labelKey: "nav.approvals",
          icon: ShieldAlert,
          badge: pendingApprovals > 0 ? pendingApprovals : undefined,
        },
        { id: "finops", path: "/finops", labelKey: "nav.finops", icon: DollarSign },
        { id: "tokens", path: "/tokens", labelKey: "nav.tokens", icon: Cpu },
        { id: "privacy", path: "/privacy", labelKey: "nav.privacy", icon: ShieldCheck },
        { id: "quality", path: "/quality", labelKey: "nav.quality", icon: Activity },
        { id: "compliance", path: "/compliance", labelKey: "nav.compliance", icon: CheckCircle },
        { id: "errors", path: "/errors", labelKey: "nav.errors", icon: AlertTriangle },
        { id: "discipline", path: "/discipline", labelKey: "nav.discipline", icon: Ban },
      ],
    },
    {
      titleKey: "nav.cat.messaging",
      items: [
        { id: "hermes", path: "/hermes", labelKey: "nav.hermes", icon: BarChart3 },
        { id: "messages", path: "/messages", labelKey: "nav.messages", icon: MessageSquare },
        { id: "memory", path: "/memory", labelKey: "nav.memory", icon: Brain },
      ],
    },
    {
      titleKey: "nav.cat.system",
      items: [
        { id: "settings", path: "/settings", labelKey: "nav.mcp", icon: Server },
        { id: "adapters", path: "/adapters", labelKey: "nav.adapters", icon: Plug },
        { id: "loop", path: "/loop", labelKey: "nav.loop", icon: Ban },
        { id: "telemetry", path: "/telemetry", labelKey: "nav.telemetry", icon: Wifi },
      ],
    },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="h-screen w-screen flex flex-col bg-background text-text-primary overflow-hidden font-sans antialiased selection:bg-brand-purple/30 selection:text-white">
        {/* ─── FIXED TOP HEADER ──────────────────────────────────────────────── */}
        <header className="h-16 shrink-0 bg-background-surface/90 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between px-4 sm:px-6 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Desktop Sidebar Collapse / Expand Button */}
            <button
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
              title={sidebarCollapsed ? t("nav.expand_sidebar") : t("nav.collapse_sidebar")}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>

            {/* Brand Logo & Title */}
            <div
              onClick={() => navigate("/")}
              className="flex items-center gap-3 cursor-pointer group select-none"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-purple-900/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-background-surface rounded-[11px] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
                    <path
                      d="M17.5 4C14.2 4 11.5 6.8 10.8 10L6.2 25.8C5.6 27.9 7.2 30 9.4 30C11.1 30 12.6 28.7 13 27L14.2 22.8H21.8L23 27C23.4 28.7 24.9 30 26.6 30C28.8 30 30.4 27.9 29.8 25.8L25.2 10C24.5 6.8 21.8 4 17.5 4ZM18 10.5C18.9 10.5 19.7 11.2 19.9 12.1L21.2 18.2H14.8L16.1 12.1C16.3 11.2 17.1 10.5 18 10.5Z"
                      fill="url(#brandGradHeader)"
                    />
                    <defs>
                      <linearGradient id="brandGradHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#c026d3" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight text-text-primary">
                    ATABEY
                  </span>
                  <Badge variant="purple" size="sm">
                    v0.0.38
                  </Badge>
                </div>
                <p className="text-[11px] text-text-muted hidden sm:block">
                  Autonomous AI Governance & Control Plane
                </p>
              </div>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live WS Status */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    wsConnected ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    wsConnected ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
              </span>
              <span className="text-text-secondary text-[11px] font-mono">
                {wsConnected ? "HERMES LIVE" : t("nav.disconnected")}
              </span>
            </div>

            {/* Pending Approval Fast Trigger */}
            {pendingApprovals > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setApprovalModalOpen(true)}
                leftIcon={<ShieldAlert size={14} />}
              >
                <span>{t("hitl.pending_badge", { count: pendingApprovals })}</span>
              </Button>
            )}

            {/* Language Switcher */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "en" ? "tr" : "en")}
              title={t("nav.language")}
              leftIcon={<Globe size={14} />}
            >
              <span className="uppercase text-xs font-mono">{lang}</span>
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === "dark" ? t("nav.theme.light") : t("nav.theme.dark")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>

            {/* Docs Link */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open("https://github.com/ysf-bkr/atabey", "_blank")}
              title="Documentation"
            >
              <CircleHelp size={16} />
            </Button>
          </div>
        </header>

        {/* ─── MAIN SHELL (FIXED SIDEBAR + SCROLLABLE MAIN) ──────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* SIDEBAR */}
          <aside
            className={`h-full shrink-0 glass-panel bg-background-surface/95 border-r border-white/[0.08] flex flex-col justify-between transition-all duration-300 z-20 ${
              sidebarCollapsed ? "w-[72px]" : "w-64"
            } ${
              mobileMenuOpen
                ? "fixed inset-y-16 left-0 w-64 translate-x-0"
                : "fixed -translate-x-full lg:static lg:translate-x-0"
            }`}
          >
            {/* Scrollable Nav Items */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
              {navCategories.map((cat) => {
                const categoryTitle = t(cat.titleKey as TranslationKey);
                return (
                  <div key={cat.titleKey} className="space-y-1">
                    {!sidebarCollapsed ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted px-3 block">
                        {categoryTitle}
                      </span>
                    ) : (
                      <div className="h-2 border-t border-white/[0.06] my-2" />
                    )}
                    <div className="space-y-0.5">
                      {cat.items.map((item) => {
                        const Icon = item.icon;
                        const isActive =
                          item.path === "/"
                            ? currentPath === "/" || currentPath === "/dashboard"
                            : currentPath === item.path || currentPath.startsWith(item.path + "/");
                        const itemLabel = t(item.labelKey as TranslationKey);

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              navigate(item.path);
                              setMobileMenuOpen(false);
                            }}
                            title={sidebarCollapsed ? itemLabel : undefined}
                            className={`w-full flex items-center rounded-lg text-sm font-medium transition-all ${
                              sidebarCollapsed
                                ? "justify-center p-2.5"
                                : "justify-between px-3 py-2"
                            } ${
                              isActive
                                ? "bg-brand-purple/15 text-brand-purple border border-brand-purple/30 shadow-sm"
                                : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon
                                size={18}
                                className={isActive ? "text-brand-purple" : "text-text-muted"}
                              />
                              {!sidebarCollapsed && <span>{itemLabel}</span>}
                            </div>
                            {!sidebarCollapsed && item.badge && (
                              <Badge
                                variant={isActive ? "purple" : "neutral"}
                                size="sm"
                              >
                                {item.badge}
                              </Badge>
                            )}
                            {sidebarCollapsed && item.badge && (
                              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-purple" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-text-muted">
              {!sidebarCollapsed ? (
                <>
                  <span className="font-mono text-[11px]">{t("nav.port")}: 5858</span>
                  <button
                    onClick={() => setReloadConfirmOpen(true)}
                    className="flex items-center gap-1 hover:text-text-primary transition-colors text-[11px]"
                  >
                    <RefreshCw size={12} />
                    <span>{t("common.reload")}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setReloadConfirmOpen(true)}
                  className="mx-auto p-1 text-text-muted hover:text-text-primary"
                  title={t("common.reload")}
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </aside>

          {/* Mobile Backdrop */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 z-10 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* MAIN SCROLLABLE CONTENT (Full Screen Responsive: Mobile <1k to 2k/4k) */}
          <main className="flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 2k:p-12 bg-background relative">
            <div className="w-full max-w-[2560px] mx-auto pb-16">
              <Routes>
                <Route
                  path="/"
                  element={
                    <OverviewPage
                      onNavigate={(tab) =>
                        navigate(tab === "security" ? "/privacy" : `/${tab}`)
                      }
                      showApprovalModal={approvalModalOpen}
                      onToggleApprovalModal={setApprovalModalOpen}
                    />
                  }
                />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route
                  path="/logs"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <LogViewer />
                    </div>
                  }
                />
                <Route
                  path="/approvals"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <ApprovalCenter />
                    </div>
                  }
                />
                <Route path="/finops" element={<FinOpsPage />} />
                <Route
                  path="/tokens"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <TokenCostsChartCard />
                      <TokenEconomyPanel />
                    </div>
                  }
                />
                <Route path="/privacy" element={<SecurityPrivacyPage />} />
                <Route path="/quality" element={<QualityCompliancePage />} />
                <Route
                  path="/compliance"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <CompliancePanel />
                    </div>
                  }
                />
                <Route
                  path="/errors"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <ErrorTracker />
                    </div>
                  }
                />
                <Route
                  path="/discipline"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <DisciplinePanel />
                    </div>
                  }
                />
                <Route path="/hermes" element={<HermesPage />} />
                <Route
                  path="/messages"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <HermesBrokerView />
                    </div>
                  }
                />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/mcp" element={<Navigate to="/settings" replace />} />
                <Route
                  path="/adapters"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <AdapterSkillsPanel />
                    </div>
                  }
                />
                <Route
                  path="/loop"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <LoopDetectorPanel />
                    </div>
                  }
                />
                <Route
                  path="/telemetry"
                  element={
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <TelemetryPanel />
                    </div>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>

        {/* Global Approval Modal Dialog */}
        <ApprovalCenterModal
          isOpen={approvalModalOpen}
          onClose={() => setApprovalModalOpen(false)}
        />

        {/* Confirm Reload Dialog */}
        <ConfirmDialog
          isOpen={reloadConfirmOpen}
          onClose={() => setReloadConfirmOpen(false)}
          onConfirm={() => {
            setReloadConfirmOpen(false);
            toast.info(t("nav.reloading"), t("nav.reload_title"));
            setTimeout(() => window.location.reload(), 400);
          }}
          title={t("nav.reload_title")}
          message={t("nav.reload_message")}
          confirmLabel={t("nav.reload_now")}
          cancelLabel={t("common.cancel")}
          type="warning"
        />
      </div>
    </>
  );
}
