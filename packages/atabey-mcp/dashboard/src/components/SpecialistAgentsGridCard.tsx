import { ChevronDown, ChevronRight, User } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import {
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui";

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
        description: a.description || t("page.agents.desc"),
        activity: a.task && a.task !== "Idle" && a.task !== t("monitor.idle") ? a.task : (a.state || "READY"),
        task: a.task || t("monitor.idle"),
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
                        <Button
                            variant="secondary"
                            size="sm"
                            className="filter-pill-btn"
                            onClick={() => setFilterOpen(!filterOpen)}
                            rightIcon={<ChevronDown size={14} className={filterOpen ? "rotate-180" : ""} />}
                        >
                            <span>{statusFilter === "All" ? t("card.agents.filter_all") : statusFilter}</span>
                        </Button>
                        {filterOpen && (
                            <div className="filter-menu animate-fade-in">
                                {["All", "Active", "READY", "Executing", "Idle"].map(st => (
                                    <Button
                                        key={st}
                                        variant={statusFilter === st ? "primary" : "ghost"}
                                        size="sm"
                                        className={statusFilter === st ? "active w-full justify-start" : "w-full justify-start"}
                                        onClick={() => { setStatusFilter(st); setFilterOpen(false); }}
                                    >
                                        {st === "All" ? t("card.agents.filter_all") : st}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="agents-table-container overflow-x-auto">
                {filteredAgents.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">
                        {t("card.agents.no_agents")}
                    </div>
                ) : (
                    <Table className="agents-status-table min-w-full">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="th-expand"></TableHead>
                                <TableHead className="th-agent">
                                    <span>{t("card.agents.table_agent")}</span>
                                    <span className="sort-arrow">↑</span>
                                </TableHead>
                                <TableHead className="th-status">{t("common.status")}</TableHead>
                                <TableHead className="th-desc">{t("card.agents.table_desc")}</TableHead>
                                <TableHead className="th-activity">{t("card.agents.table_activity")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAgents.map(agent => {
                                const isExpanded = expandedAgent === agent.name;
                                const isActive = agent.status.toLowerCase() === "active" || agent.status.toLowerCase() === "ready";

                                return (
                                    <React.Fragment key={agent.name}>
                                        <TableRow
                                            className={`agent-row ${isExpanded ? "row-expanded" : ""}`}
                                            onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                                        >
                                            <TableCell className="td-expand">
                                                <div className="status-indicator-bar" />
                                                <span className="expand-chevron">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>
                                            </TableCell>
                                            <TableCell className="td-agent">
                                                <div className="agent-badge-name">
                                                    <div className="agent-avatar-icon">
                                                        <User size={14} />
                                                    </div>
                                                    <span className="agent-handle">@{agent.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="td-status">
                                                <span className={`status-pill ${isActive ? "status-active" : "status-idle"}`}>
                                                    <span className="status-dot" />
                                                    <span>{agent.status}</span>
                                                </span>
                                            </TableCell>
                                            <TableCell className="td-desc">
                                                <span className="desc-text" title={agent.description}>
                                                    {agent.description}
                                                </span>
                                            </TableCell>
                                            <TableCell className="td-activity">
                                                <span className="activity-text" title={agent.activity}>
                                                    {agent.activity}
                                                </span>
                                            </TableCell>
                                        </TableRow>

                                        {isExpanded && (
                                            <TableRow className="agent-expanded-detail-row">
                                                <TableCell colSpan={5}>
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
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                className="small-btn"
                                                                onClick={(e) => { e.stopPropagation(); onNavigate?.(); }}
                                                            >
                                                                {t("card.agents.inspect")}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}

