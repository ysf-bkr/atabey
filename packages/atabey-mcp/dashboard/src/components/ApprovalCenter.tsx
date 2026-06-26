import { Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";

interface Approval {
    id: string; traceId: string; description: string; status: string; timestamp: string;
}

export function ApprovalCenter() {
    const { data: initial } = useApi<Approval[]>("/approvals", 5000);
    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

    useWS({ handlers: { approval: (d) => {
        const a = d as unknown as Approval;
        if (a.id) { setApprovals(prev => [a, ...prev]); showToast(`New approval: ${a.traceId}`, "success"); }
    }}});

    const list = approvals.length ? approvals : (Array.isArray(initial) ? initial : []);
    if (Array.isArray(initial) && approvals.length === 0 && initial.length > 0) setApprovals(initial);

    function showToast(msg: string, type: string) {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    }

    async function handleAction(id: string, traceId: string, action: "approve" | "reject") {
        try {
            const endpoint = action === "approve" ? `/api/approve/${traceId}` : `/api/reject/${traceId}`;
            const r = await fetch(endpoint, { method: "POST" });
            if (r.ok) {
                if (action === "approve") {
                    setApprovals(prev => prev.map(a => a.traceId === traceId ? { ...a, status: "APPROVED" } : a));
                } else {
                    setApprovals(prev => prev.map(a => a.traceId === traceId ? { ...a, status: "REJECTED" } : a));
                }
                showToast(action === "approve" ? "Approved" : "Rejected", "success");
            } else showToast("Failed", "error");
        } catch { showToast("Network error", "error"); }
    }

    const pending = list.filter(a => a.status === "PENDING");

    return <div className="card">
        <div className="card-header">
            <h2><ShieldCheck size={20} /> HITL Policy Gates</h2>
            <span className="badge">{pending.length} pending overrides</span>
        </div>

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

        <div className="list-container">
            {list.length === 0 && <div className="empty-state">No approvals</div>}
            {list.map(a => (
                <div key={a.id} className="list-item" style={{ opacity: (a.status === "APPROVED" || a.status === "REJECTED") ? 0.6 : 1 }}>
                    <div className="detail-row"><span className="detail-label">Trace:</span><span className="trace-id">{a.traceId}</span></div>
                    <div className="detail-row"><span className="detail-label">Task:</span><span className="detail-value">{a.description}</span></div>
                    <div className="detail-row">
                        <span className="detail-label">Status:</span>
                        <span className={`status-${a.status.toLowerCase()}`} style={{ fontSize: "0.85rem" }}>{a.status}</span>
                    </div>
                    <div className="detail-row"><span className="detail-label">Time:</span><span className="detail-value">{new Date(a.timestamp).toLocaleString()}</span></div>
                    {a.status === "PENDING" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary" onClick={() => handleAction(a.id, a.traceId, "approve")}><Check size={14} /> Approve</button>
                            <button className="btn btn-danger" onClick={() => handleAction(a.id, a.traceId, "reject")}><X size={14} /> Reject</button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>;
}
