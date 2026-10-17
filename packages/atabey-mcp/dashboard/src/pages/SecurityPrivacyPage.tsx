import React from "react";
import { ShieldCheck, ShieldAlert, Lock, EyeOff } from "lucide-react";
import { ApprovalCenter } from "../components/ApprovalCenter";
import { PrivacyPanel } from "../components/PrivacyPanel";
import { DisciplinePanel } from "../components/DisciplinePanel";
import { PIIComplianceCard } from "../components/PIIComplianceCard";
import { PageHeader, Badge, StatCard } from "../components/ui";
import { useI18n } from "../i18n";

export function SecurityPrivacyPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t("page.privacy.title")}
        description={t("page.privacy.desc")}
        badge={
          <Badge variant="purple" size="md">
            {t("page.privacy.badge")}
          </Badge>
        }
      />

      {/* Security Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2k:grid-cols-4 gap-4 2k:gap-6">
        <StatCard
          title={t("stat.policy_gate_status")}
          value="Fail-Closed"
          subtitle={t("stat.policy_gate_sub")}
          icon={<Lock className="w-5 h-5 text-emerald-400" />}
          glow="purple"
        />
        <StatCard
          title={t("stat.audit_trail_integrity")}
          value="HMAC-SHA256"
          subtitle={t("stat.audit_trail_sub")}
          icon={<ShieldCheck className="w-5 h-5 text-brand-purple" />}
        />
        <StatCard
          title={t("stat.pii_masking_patterns")}
          value="20+ Patterns"
          subtitle={t("stat.pii_masking_sub")}
          icon={<EyeOff className="w-5 h-5 text-cyan-400" />}
          glow="cyan"
        />
        <StatCard
          title={t("stat.human_authorization")}
          value="Risk ≥ 60"
          subtitle={t("stat.human_authorization_sub")}
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2k:grid-cols-2 gap-6 2k:gap-8">
        <ApprovalCenter />
        <PIIComplianceCard onNavigate={() => {}} />
      </div>

      <div className="space-y-6">
        <PrivacyPanel />
        <DisciplinePanel />
      </div>
    </div>
  );
}
