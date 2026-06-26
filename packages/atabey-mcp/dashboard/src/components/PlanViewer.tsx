import { ChevronDown, ChevronUp, GitBranch } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";

interface PlanTask {
    id: string;
    traceId: string;
    description: string;
    agent: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "FAILED";
    priority: string;
    dependencies: string[];
    createdAt?: string;
}

export function PlanViewer() {
    const { data: tasks, loading } = useApi<PlanTask[]>("/tasks", 5000);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [expandedTask, setExpandedTask] = useState<string | null>(null);

    const list = tasks || [];

    const filtered = statusFilter === "ALL"
        ? list
        : list.filter(t => t.status === statusFilter);

    const stats = {
        total: list.length,
        pending: list.filter(t => t.status === "PENDING").length,
        inProgress: list.filter(t => t.status === "IN_PROGRESS").length,
        completed: list.filter(t => t.status === "COMPLETED").length,
        blocked: list.filter(t => t.status === "BLOCKED" || t.status === "FAILED").length,
    };

    return <div className="card">
        <div className="card-header">
            <h2><GitBranch size={20} /> Task Planner</h2>
            <span className="badge">{list.length} tasks</span>
        </div>

        <div className="stats-grid">
            <div className="stat-box"><span className="stat-count">{stats.total}</span><span className="stat-label">Total</span></div>
            <div className="stat-box warn"><span className="stat-count">{stats.pending}</span><span className="stat-label">Pending</span></div>
            <div className="stat-box info"><span className="stat-count">{stats.inProgress}</span><span className="stat-label">In Progress</span></div>
            <div className="stat-box pass"><span className="stat-count">{stats.completed}</span><span className="stat-label">Completed</span></div>
            <div className="stat-box fail"><span className="stat-count">{stats.blocked}</span><span className="stat-label">Blocked</span></div>
        </div>

        <div className="filter-tabs">
            {["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "FAILED"].map(f => (
                <button key={f} className={`filter-tab ${statusFilter === f ? "active" : ""}`} onClick={() => setStatusFilter(f)}>
                    {f.replace("_", " ")}
                </button>
            ))}
        </div>

        {loading && !list.length && <div className="empty-state">Loading plans...</div>}

        <div className="list-container">
            {filtered.length === 0 && <div className="empty-state">No tasks found</div>}
            {filtered.slice(0, 50).map(task => {
                const open = expandedTask === task.id;
                const statusClass = task.status.toLowerCase();
                return <div key={task.id} className={`list-item task-item ${statusClass}`} onClick={() => setExpandedTask(open ? null : task.id)}>
                    <div className="task-header">
                        <span className="trace-id">{task.traceId}</span>
                        <span className="task-agent">@{task.agent}</span>
                        <span className={`task-status-badge ${statusClass}`}>{task.status.replace("_", " ")}</span>
                        <span className="text-muted" style={{ marginLeft: "auto" }}>
                            {task.priority}
                        </span>
                        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                    </div>
                    <div className="text-secondary text-sm">
                        {task.description}
                    </div>
                    {open && (
                        <div className="task-details">
                            <div className="detail-row">
                                <span className="detail-label">Created:</span>
                                <span className="detail-value">{task.createdAt ? new Date(task.createdAt).toLocaleString() : "Unknown"}</span>
                            </div>
                            {task.dependencies.length > 0 && (
                                <div className="detail-row">
                                    <span className="detail-label">Depends on:</span>
                                    <span className="detail-value">{task.dependencies.join(", ")}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>;
            })}
        </div>
    </div>;
}
