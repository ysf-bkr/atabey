import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "error" | "info" | "purple" | "cyan" | "neutral";
  size?: "sm" | "md";
  pulse?: boolean;
}

export function Badge({
  children,
  className = "",
  variant = "neutral",
  size = "md",
  pulse = false,
  ...props
}: BadgeProps) {
  const variantStyles = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    error: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    neutral: "bg-white/5 text-text-secondary border-white/10",
  };

  const pulseColors = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-rose-400",
    info: "bg-sky-400",
    purple: "bg-purple-400",
    cyan: "bg-cyan-400",
    neutral: "bg-slate-400",
  };

  const sizeStyles = {
    sm: "text-[10px] px-2 py-0.5 font-medium",
    md: "text-xs px-2.5 py-1 font-medium",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} tracking-wide ${className}`}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColors[variant]}`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${pulseColors[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}
