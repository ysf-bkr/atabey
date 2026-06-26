import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";

interface Agent {
    name: string; state: string; task: string; last_updated: string;
}

const ALL_AGENT_NAMES = [
    "manager",
    "security",
    "architect",
    "backend",
    "frontend",
    "quality",
    "database",
    "analyst",
    "mobile",
    "native",
    "devops",
    "explorer",
    "git"
];

export function AgentMonitor() {
    const { data: initial, loading, error } = useApi<Agent[]>("/agents", 5000);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);

    useWS({ handlers: { agent_update: (d) => {
        const u = d as unknown as Agent;
        if (u.name) setAgents(prev => {
            const cleanName = u.name.replace("@", "");
            const exists = prev.some(a => a.name.replace("@", "") === cleanName);
            if (exists) {
                return prev.map(a => a.name.replace("@", "") === cleanName ? { ...a, ...u } : a);
            }
            return [...prev, u];
        });
    }}});

    const rawList = agents.length ? agents : (Array.isArray(initial) ? initial : []);
    if (Array.isArray(initial) && agents.length === 0 && initial.length > 0) setAgents(initial);

    // Merge database state with the full list of 13 corporate agents
    const list = ALL_AGENT_NAMES.map(name => {
        const existing = rawList.find(a => a.name.replace("@", "") === name);
        if (existing) {
            return {
                ...existing,
                name: name
            };
        }
        return {
            name: name,
            state: "READY",
            task: "Idle",
            last_updated: new Date().toISOString()
        };
    });

    if (loading && !rawList.length) return <div className="card"><div className="card-header"><h2><Bot size={20} /> Governed Specialist Monitor</h2></div><div className="empty-state">Loading specialists...</div></div>;
    if (error && !rawList.length) return <div className="card"><div className="card-header"><h2><Bot size={20} /> Governed Specialist Monitor</h2></div><div className="error">Error: {error}</div></div>;

    return <div className="card">
        <div className="card-header">
            <h2><Bot size={20} /> Specialist Monitor</h2>
            <span className="badge">{list.length} specialists</span>
        </div>
        <div className="agent-list-container">
            <div className="agent-grid">
                {list.map(a => {
                    const open = expanded === a.name;
                    const statusClass = a.state.toLowerCase();
                    return <div key={a.name} className={`agent-card ${open ? "expanded" : ""}`} onClick={() => setExpanded(open ? null : a.name)}>
                        <div className="agent-header">
                            <span className={`agent-dot ${statusClass}`} />
                            <span className="agent-name">@{a.name}</span>
                            <span className={`agent-state ${statusClass}`}>{a.state}</span>
                            {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                        </div>
                        <div className="detail-row"><span className="detail-label">Task:</span><span className="detail-value">{a.task || "Idle"}</span></div>
                        {open && <div className="detail-row"><span className="detail-label">Updated:</span><span className="detail-value">{new Date(a.last_updated).toLocaleString()}</span></div>}
                    </div>;
                })}
            </div>
        </div>
    </div>;
}
