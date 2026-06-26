import { useEffect, useState } from "react";
import {
    Plug,
    Cpu,
    Wrench,
    Folder,
    Edit,
    RefreshCw,
    Lock,
    Check,
    Search,
    Brain
} from "lucide-react";

interface AdapterSkillSummary {
    id: string;
    skillCount: number;
    toolsCount: number;
    skills: string[];
}

export function AdapterSkillsPanel() {
    const [adapters, setAdapters] = useState<AdapterSkillSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAdapters = () => {
            fetch("/api/adapters/skills")
                .then(r => r.json())
                .then(d => {
                    if (d.success) setAdapters(d.data);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        };
        fetchAdapters();
        const interval = setInterval(fetchAdapters, 15000);
        return () => clearInterval(interval);
    }, []);

    const SKILL_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
        file_system: Folder,
        editing: Edit,
        orchestration: RefreshCw,
        governance: Lock,
        quality: Check,
        search: Search,
        memory: Brain,
    };

    return (
        <div className="card">
            <div className="card-header">
                <h2>
                    <Plug size={20} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 8 }} />
                    Adapter Skills
                </h2>
                {!loading && <span className="badge">{adapters.length} adapters</span>}
            </div>

            {loading && <div className="empty-state">Loading adapter skills...</div>}

            {!loading && (
                <div className="adapter-list">
                    {adapters.map(adapter => {
                        return (
                            <div key={adapter.id} className="adapter-item">
                                <div className="adapter-header">
                                    <span className="adapter-name">
                                        <Cpu size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
                                        {adapter.id}
                                    </span>
                                    <span className="adapter-meta">
                                        <Wrench size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                                        {adapter.toolsCount} tools · {adapter.skillCount} skills
                                    </span>
                                </div>
                                <div className="adapter-skills-grid">
                                    {adapter.skills.map(skill => {
                                        const IconComp = SKILL_ICONS[skill];
                                        return (
                                            <span key={skill} className="skill-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                                {IconComp ? (
                                                    <IconComp size={12} />
                                                ) : (
                                                    <span style={{ fontSize: "10px" }}>•</span>
                                                )}
                                                {skill.replace(/_/g, " ")}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
