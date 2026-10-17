import React, { useEffect, useState } from "react";
import { Coins, RefreshCw, Save, Webhook } from "lucide-react";
import { useI18n } from "../i18n";
import { Card, CardHeader, CardContent, Badge, Button, EmptyState, Input, useToast } from "./ui";

interface FinOpsConfig {
  monthlyBudget: number;
  agentBudgets: Record<string, number>;
  webhookUrl: string | null;
}

/**
 * Per-agent budget ceilings + budget-alert webhook, backed by
 * `GET|POST /api/finops/config`.
 */
export function AgentBudgetPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [config, setConfig] = useState<FinOpsConfig | null>(null);
  const [monthly, setMonthly] = useState("");
  const [webhook, setWebhook] = useState("");
  const [agentInputs, setAgentInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = (c: FinOpsConfig) => {
    setConfig(c);
    setMonthly(String(c.monthlyBudget));
    setWebhook(c.webhookUrl ?? "");
    const inputs: Record<string, string> = {};
    for (const [agent, value] of Object.entries(c.agentBudgets)) inputs[agent] = String(value);
    setAgentInputs(inputs);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finops/config");
      const json = await res.json();
      if (json.success) apply(json.data as FinOpsConfig);
    } catch {
      /* keep previous state */
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const agentBudgets: Record<string, number> = {};
      for (const [agent, value] of Object.entries(agentInputs)) {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) agentBudgets[agent] = parsed;
      }
      const body: Record<string, unknown> = {
        agentBudgets,
        webhookUrl: webhook.trim() ? webhook.trim() : null,
      };
      const monthlyNum = parseFloat(monthly);
      if (Number.isFinite(monthlyNum) && monthlyNum > 0) body.monthlyBudget = monthlyNum;

      const res = await fetch("/api/finops/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        apply(json.data as FinOpsConfig);
        toast.success(t("finops.agent_budget.saved"));
      } else {
        throw new Error(json.error || "save failed");
      }
    } catch (err) {
      toast.error((err as Error).message, t("finops.agent_budget.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const agents = config ? Object.keys(config.agentBudgets) : [];

  return (
    <Card className="shadow-lg">
      <CardHeader
        title={t("finops.agent_budget.title")}
        description={t("finops.agent_budget.desc")}
        icon={<Coins className="w-5 h-5 text-amber-400" />}
        action={
          <Button variant="ghost" size="sm" onClick={load} leftIcon={<RefreshCw size={13} />}>
            {t("common.refresh")}
          </Button>
        }
      />
      <CardContent className="p-4 sm:p-6 space-y-4">
        {loading && !config ? (
          <EmptyState
            icon={<Coins className="w-8 h-8 text-text-muted animate-pulse" />}
            title={t("finops.agent_budget.loading")}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={t("finops.agent_budget.monthly")}
                type="number"
                min="0"
                step="1"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                leftIcon={<Coins size={14} />}
              />
              <Input
                label={t("finops.agent_budget.webhook")}
                type="url"
                placeholder={t("finops.agent_budget.webhook_placeholder")}
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                leftIcon={<Webhook size={14} />}
              />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                {t("finops.agent_budget.agent_limit")}
              </span>
              {agents.length === 0 ? (
                <div className="text-xs text-text-muted text-center py-3">
                  {t("finops.agent_budget.none")}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto pr-1">
                  {agents.map((agent) => (
                    <div key={agent} className="flex items-center gap-2">
                      <Badge variant="cyan" size="sm">
                        @{agent}
                      </Badge>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={agentInputs[agent] ?? ""}
                        onChange={(e) =>
                          setAgentInputs((prev) => ({ ...prev, [agent]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={save}
                disabled={saving}
                leftIcon={<Save size={14} />}
              >
                {saving ? t("finops.agent_budget.saving") : t("finops.agent_budget.save")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
