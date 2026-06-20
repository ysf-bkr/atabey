import { Brain, Search, X } from "lucide-react";
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";

interface MemoryEntry {
    id: string;
    content: string;
    type: string;
    timestamp: string;
    relevance?: number;
}

export function MemoryInsights() {
    const { data: initial, loading, error } = useApi<MemoryEntry[]>("/memory/search", 15000);
    const [entries, setEntries] = useState<MemoryEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
    const [searching, setSearching] = useState(false);

    useWS({
        handlers: {
            memory_update: (d) => {
                const entry = d as unknown as MemoryEntry;
                if (entry.id) setEntries(prev => [entry, ...prev].slice(0, 100));
            },
        },
    });

    const list = entries.length ? entries : (Array.isArray(initial) ? initial : []);
    if (Array.isArray(initial) && entries.length === 0 && initial.length > 0) setEntries(initial);

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        setSearching(true);
        try {
            const r = await fetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
            const data = await r.json();
            setSearchResults(data.data || []);
        } catch {
            setSearchResults([]);
        }
        setSearching(false);
    };

    const displayList = searchResults !== null ? searchResults : list;

    return <div className="card">
        <div className="card-header">
            <h2><Brain size={20} /> Memory Insights</h2>
            <span className="badge">{list.length} entries</span>
        </div>

        <div className="search-bar">
            <input
                type="text"
                placeholder="Search vector memory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="search-input"
            />
            <button className="btn btn-ghost" onClick={handleSearch} disabled={searching}>
                {searching ? "..." : <><Search size={14} /> Search</>}
            </button>
            {searchResults !== null && (
                <button className="btn btn-ghost" onClick={() => { setSearchResults(null); setSearchQuery(""); }}>
                    <X size={14} /> Clear
                </button>
            )}
        </div>

        {loading && !list.length && <div className="empty-state">Loading memory...</div>}
        {error && !list.length && <div className="error">Error: {error}</div>}

        <div className="list-container">
            {displayList.length === 0 && (
                <div className="empty-state">
                    {searchResults !== null ? "No results found" : "No memory entries"}
                </div>
            )}
            {displayList.slice(0, 50).map((entry, idx) => (
                <div key={entry.id || idx} className="list-item">
                    <div className="memory-meta">
                        <span className="memory-tag">
                            {entry.type || "memory"}
                        </span>
                        {entry.relevance !== undefined && (
                            <span className={entry.relevance > 0.7 ? "status-ready" : entry.relevance > 0.4 ? "status-executing" : "text-muted"}>
                                {(entry.relevance * 100).toFixed(0)}% match
                            </span>
                        )}
                        <span className="trace-id" style={{ marginLeft: "auto" }}>
                            {new Date(entry.timestamp).toLocaleString()}
                        </span>
                    </div>
                    <div className="memory-text">
                        {entry.content.substring(0, 200)}{entry.content.length > 200 ? "..." : ""}
                    </div>
                </div>
            ))}
        </div>
    </div>;
}
