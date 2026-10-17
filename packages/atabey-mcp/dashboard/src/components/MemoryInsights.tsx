import React, { useState } from "react";
import { Brain, Search, X, Clock, CheckCircle2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, Input, EmptyState } from "./ui";

interface MemoryEntry {
  id: string;
  content: string;
  type: string;
  timestamp: string;
  relevance?: number;
}

export function MemoryInsights() {
  const { t } = useI18n();
  const { data: initial, loading, error } = useApi<MemoryEntry[]>("/memory/search", 15000);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  useWS({
    handlers: {
      memory_update: (d) => {
        const entry = d as unknown as MemoryEntry;
        if (entry?.id) setEntries((prev) => [entry, ...prev].slice(0, 100));
      },
    },
  });

  const list = entries.length ? entries : Array.isArray(initial) ? initial : [];
  if (Array.isArray(initial) && entries.length === 0 && initial.length > 0) {
    setEntries(initial);
  }

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

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("memory.title")}
        description={t("page.memory.desc")}
        icon={<Brain className="w-5 h-5 text-brand-purple" />}
        action={
          <Badge variant="purple" size="sm">
            {t("memory.entries_count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={t("memory.placeholder")}
              leftIcon={<Search size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button
            variant="primary"
            onClick={handleSearch}
            disabled={searching}
            leftIcon={<Search size={14} />}
          >
            {searching ? t("hitl.submitting") : t("memory.search_btn")}
          </Button>
          {searchResults !== null && (
            <Button
              variant="secondary"
              onClick={() => {
                setSearchResults(null);
                setSearchQuery("");
              }}
              leftIcon={<X size={14} />}
            >
              {t("common.clear")}
            </Button>
          )}
        </div>

        {/* Entries Stream */}
        {loading && !list.length ? (
          <EmptyState
            icon={<Brain className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("memory.loading")}
          />
        ) : error && !list.length ? (
          <EmptyState
            icon={<Brain className="w-8 h-8 text-rose-400" />}
            title={t("common.error")}
            description={error}
          />
        ) : displayList.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("memory.no_entries")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {displayList.slice(0, 50).map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="purple" size="sm">
                      {entry.type || "memory"}
                    </Badge>
                    {entry.relevance !== undefined && (
                      <Badge
                        variant={entry.relevance > 0.7 ? "emerald" : "amber"}
                        size="sm"
                      >
                        {t("memory.match", {
                          percent: (entry.relevance * 100).toFixed(0),
                        })}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed break-words">
                  {entry.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
