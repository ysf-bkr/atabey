import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  change?: {
    value: string;
    isPositive?: boolean;
  };
  glow?: "purple" | "cyan" | "none";
}

export function StatCard({
  title,
  value,
  icon,
  subtitle,
  change,
  glow = "none",
}: StatCardProps) {
  return (
    <Card glow={glow} className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{title}</span>
        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-brand-purple">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight text-text-primary">
          {value}
        </span>
        {change && (
          <div
            className={`flex items-center text-xs font-medium ${
              change.isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {change.isPositive ? (
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            )}
            <span>{change.value}</span>
          </div>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
      )}
    </Card>
  );
}
