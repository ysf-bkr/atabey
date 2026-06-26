import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";

interface Message {
    id: number; from: string; to: string; category: string; content: string; traceId: string; status: string; timestamp: string;
}

const CATEGORIES = ["ALL", "ACTION", "DELEGATION", "SUBTASK", "REPLY", "ALERT"];

export function HermesBrokerView() {
    const { data: initial } = useApi<Message[]>("/messages", 5000);
    const [messages, setMessages] = useState<Message[]>([]);
    const [filter, setFilter] = useState("ALL");

    useWS({ handlers: { message: (d) => {
        const m = d as unknown as Message;
        if (m.id) setMessages(prev => [m, ...prev].slice(0, 200));
    }}});

    const list = messages.length ? messages : (Array.isArray(initial) ? initial : []);
    if (Array.isArray(initial) && messages.length === 0 && initial.length > 0) setMessages(initial);

    const filtered = filter === "ALL" ? list : list.filter(m => m.category === filter);

    return <div className="card">
        <div className="card-header">
            <h2><MessageSquare size={20} /> Hermes Messages</h2>
            <span className="badge">{list.length} messages</span>
        </div>

        <div className="filter-tabs">
            {CATEGORIES.map(c => (
                <button key={c} className={`filter-tab ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>{c}</button>
            ))}
        </div>

        <div className="list-container">
            {filtered.length === 0 && <div className="empty-state">No messages</div>}
            {filtered.slice(0, 100).map(m => (
                <div key={m.id} className="list-item">
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: "0.8rem" }}>
                        <span style={{ color: "#64748b" }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                        <span style={{ color: "#a855f7", fontWeight: 500 }}>{m.from}</span>
                        <span style={{ color: "#64748b" }}>→</span>
                        <span style={{ color: "#38bdf8", fontWeight: 500 }}>{m.to}</span>
                        <span className="badge" style={{ fontSize: "0.65rem" }}>{m.category}</span>
                        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: m.status === "PENDING" ? "#eab308" : "#64748b" }}>{m.status}</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#cbd5e1", wordBreak: "break-word" }}>
                        {m.content.substring(0, 150)}{m.content.length > 150 ? "..." : ""}
                    </div>
                    <div className="trace-id" style={{ marginTop: 4 }}>Trace: {m.traceId}</div>
                </div>
            ))}
        </div>
    </div>;
}
