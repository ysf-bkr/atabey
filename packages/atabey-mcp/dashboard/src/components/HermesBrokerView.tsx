import React, { useState } from "react";
import { MessageSquare, ArrowRight, Hash, Clock, CheckCircle2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useWS } from "../hooks/useWS";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState, Button } from "./ui";

interface Message {
  id: number;
  from: string;
  to: string;
  category: string;
  content: string;
  traceId: string;
  status: string;
  timestamp: string;
}

const CATEGORIES = ["ALL", "ACTION", "DELEGATION", "SUBTASK", "REPLY", "ALERT"];

export function HermesBrokerView() {
  const { t } = useI18n();
  const { data: initial } = useApi<Message[]>("/messages", 5000);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState("ALL");

  useWS({
    handlers: {
      message: (d) => {
        const m = d as unknown as Message;
        if (m?.id) setMessages((prev) => [m, ...prev].slice(0, 200));
      },
    },
  });

  const list = messages.length ? messages : Array.isArray(initial) ? initial : [];
  if (Array.isArray(initial) && messages.length === 0 && initial.length > 0) {
    setMessages(initial);
  }

  const filtered = filter === "ALL" ? list : list.filter((m) => m.category === filter);

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("hermes.messages_title")}
        description={t("page.hermes.desc")}
        icon={<MessageSquare className="w-5 h-5 text-cyan-400" />}
        action={
          <Badge variant="cyan" size="sm">
            {t("hermes.messages_count", { count: list.length })}
          </Badge>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={filter === c ? "primary" : "ghost"}
              onClick={() => setFilter(c)}
              className="uppercase"
            >
              {c === "ALL" ? t("common.all") : c}
            </Button>
          ))}
        </div>

        {/* Message Stream */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("hermes.no_messages")}
            description={t("hitl.safety_clear")}
          />
        ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {filtered.slice(0, 100).map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono font-semibold text-brand-purple">
                      @{m.from}
                    </span>
                    <ArrowRight size={12} className="text-text-muted" />
                    <span className="font-mono font-semibold text-cyan-400">
                      @{m.to}
                    </span>
                    <Badge variant="neutral" size="sm">
                      {m.category}
                    </Badge>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-medium ${
                      m.status === "PENDING" ? "text-amber-400" : "text-text-muted"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed break-words">
                  {m.content}
                </p>

                <div className="pt-1.5 border-t border-white/[0.04] flex items-center gap-1 text-[11px] font-mono text-text-muted">
                  <Hash size={11} />
                  <span>
                    {t("hermes.trace_label")}: {m.traceId}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
