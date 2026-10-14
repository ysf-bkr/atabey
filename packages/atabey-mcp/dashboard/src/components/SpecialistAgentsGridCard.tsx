import { ChevronDown, ChevronRight, User } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";

interface Agent {
    name: string;
    state?: string;
    task?: string;
    description?: string;
    activity?: string;
    last_updated?: string;
}

export function SpecialistAgentsGridCard({ onNavigate }: { onNavigate?: () => void }) {
    const { t } = useI18n();
    const { data: serverAgents } = useApi<{ success: boolean; data: Agent[] } | Agent[]>("/agents", 4000);
    const [liveAgents, setLiveAgents] = useState<Agent[]>([]);
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("All");

    useWS({
        handlers: {
            agent_update: (d) => {
                const u = d as unknown as Agent;
                if (u?.name) {
                    setLiveAgents(prev => {
                        const clean = u.name.replace("@", "");
                        const exists = prev.some(a => a.name.replace("@", "") === clean);
                        if (exists) {
                            return prev.map(a => a.name.replace("@", "") === clean ? { ...a, ...u } : a);
                        }
                        return [...prev, u];
                    });
                }
            }
        }
    });

    const rawList: Agent[] = Array.isArray(serverAgents)
        ? serverAgents
        : (serverAgents && "data" in serverAgents && Array.isArray(serverAgents.data))
        ? serverAgents.data
        : [];

    // Merge live updates with server list (zero mock data)
    const agentMap = new Map<string, Agent>();
    for (const a of rawList) {
        agentMap.set(a.name.replace("@", "").toLowerCase(), a);
    }
    for (const a of liveAgents) {
        agentMap.set(a.name.replace("@", "").toLowerCase(), a);
    }

    const agents = Array.from(agentMap.values()).map(a => ({
        name: a.name.replace("@", ""),
        status: a.state || "READY",
        description: a.description || "Autonomous Specialist Agent",
        activity: a.task && a.task !== "Idle" ? a.task : (a.state || "READY"),
        task: a.task || "Idle",
        last_updated: a.last_updated || new Date().toISOString().replace("T", " ").substring(0, 19),
    }));

    const filteredAgents = agents.filter(a => {
        if (statusFilter === "All") return true;
        return a.status.toLowerCase() === statusFilter.toLowerCase();
    });

    return (
        <div className="atabey-card specialist-grid-card">
            <div className="atabey-card-header">
                <div className="card-title-group">
                    <h3 className="card-title">{t("card.agents.title")}</h3>
                </div>
                <div className="card-actions">
                    <div className="filter-dropdown-wrapper">
                        <button
                            className="filter-pill-btn"
                            onClick={() => setFilterOpen(!filterOpen)}
                        >
                            <span>{statusFilter === "All" ? t("card.agents.filter_all") : statusFilter}</span>
                            <ChevronDown size={14} className={filterOpen ? "rotate-180" : ""} />
                        </button>
                        {filterOpen && (
                            <div className="filter-menu animate-fade-in">
                                {["All", "Active", "READY", "Executing", "Idle"].map(st => (
                                    <button
                                        key={st}
                                        className={statusFilter === st ? "active" : ""}
                                        onClick={() => { setStatusFilter(st); setFilterOpen(false); }}
                                    >
                                        {st === "All" ? t("card.agents.filter_all") : st}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="agents-table-container">
                {filteredAgents.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">
                        {t("card.agents.no_agents")}
                    </div>
                ) : (
                    <table className="agents-status-table">
                        <thead>
                            <tr>
                                <th className="th-expand"></th>
                                <th className="th-agent">
                                    <span>Agent</span>
                                    <span className="sort-arrow">↑</span>
                                </th>
                                <th className="th-status">{t("common.status")}</th>
                                <th className="th-desc">Description</th>
                                <th className="th-activity">Activity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAgents.map(agent => {
                                const isExpanded = expandedAgent === agent.name;
                                const isActive = agent.status.toLowerCase() === "active" || agent.status.toLowerCase() === "ready";

                                return (
                                    <React.Fragment key={agent.name}>
                                        <tr
                                            className={`agent-row ${isExpanded ? "row-expanded" : ""}`}
                                            onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                                        >
                                            <td className="td-expand">
                                                <div className="status-indicator-bar" />
                                                <span className="expand-chevron">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>
                                            </td>
                                            <td className="td-agent">
                                                <div className="agent-badge-name">
                                                    <div className="agent-avatar-icon">
                                                        <User size={14} />
                                                    </div>
                                                    <span className="agent-handle">@{agent.name}</span>
                                                </div>
                                            </td>
                                            <td className="td-status">
                                                <span className={`status-pill ${isActive ? "status-active" : "status-idle"}`}>
                                                    <span className="status-dot" />
                                                    <span>{agent.status}</span>
                                                </span>
                                            </td>
                                            <td className="td-desc">
                                                <span className="desc-text" title={agent.description}>
                                                    {agent.description}
                                                </span>
                                            </td>
                                            <td className="td-activity">
                                                <span className="activity-text" title={agent.activity}>
                                                    {agent.activity}
                                                </span>
                                            </td>
                                        </tr>

                                        {/* Expanded Detail Row */}
                                        {isExpanded && (
                                            <tr className="agent-expanded-detail-row">
                                                <td colSpan={5}>
                                                    <div className="expanded-detail-box animate-fade-in">
                                                        <div className="detail-item">
                                                            <span className="detail-key">{t("card.agents.task")}:</span>
                                                            <span className="detail-val">{agent.task}</span>
                                                        </div>
                                                        <div className="detail-item">
                                                            <span className="detail-key">{t("card.agents.last_updated")}:</span>
                                                            <span className="detail-val">{agent.last_updated}</span>
                                                        </div>
                                                        <div className="detail-actions">
                                                            <button
                                                                className="small-btn"
                                                                onClick={(e) => { e.stopPropagation(); onNavigate?.(); }}
                                                            >
                                                                Inspect Specialist
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
