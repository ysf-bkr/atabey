import React, { useEffect, useState } from "react";
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
  Brain,
  CheckCircle2,
} from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, EmptyState } from "./ui";

interface AdapterSkillSummary {
  id: string;
  skillCount: number;
  toolsCount: number;
  skills: string[];
}

export function AdapterSkillsPanel() {
  const { t } = useI18n();
  const [adapters, setAdapters] = useState<AdapterSkillSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdapters = () => {
      fetch("/api/adapters/skills")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setAdapters(d.data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchAdapters();
    const interval = setInterval(fetchAdapters, 15000);
    return () => clearInterval(interval);
  }, []);

  const SKILL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    file_system: Folder,
    editing: Edit,
    orchestration: RefreshCw,
    governance: Lock,
    quality: Check,
    search: Search,
    memory: Brain,
  };

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("nav.adapters")}
        description={t("page.settings.desc")}
        icon={<Plug className="w-5 h-5 text-cyan-400" />}
        action={
          !loading ? (
            <Badge variant="cyan" size="sm">
              {adapters.length} {t("common.entries")}
            </Badge>
          ) : undefined
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {loading && !adapters.length ? (
          <EmptyState
            icon={<Plug className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("common.loading")}
          />
        ) : adapters.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            title={t("common.no_data")}
          />
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {adapters.map((adapter) => (
              <div
                key={adapter.id}
                className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-brand-purple" />
                    <span className="font-mono font-semibold text-text-primary">
                      {adapter.id}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-text-muted flex items-center gap-1">
                    <Wrench size={11} />
                    {adapter.toolsCount} tools · {adapter.skillCount} skills
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {adapter.skills.map((skill) => {
                    const IconComp = SKILL_ICONS[skill];
                    return (
                      <span
                        key={skill}
                        className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-text-secondary flex items-center gap-1 font-mono"
                      >
                        {IconComp ? <IconComp size={11} className="text-cyan-400" /> : "•"}
                        <span>{skill.replace(/_/g, " ")}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
