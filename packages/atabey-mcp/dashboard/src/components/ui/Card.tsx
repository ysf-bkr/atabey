import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: "purple" | "cyan" | "none";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", glow = "none", ...props }, ref) => {
    const glowStyles = {
      none: "",
      purple: "hover:shadow-[0_0_25px_-5px_rgba(139,92,246,0.3)] hover:border-purple-500/30",
      cyan: "hover:shadow-[0_0_25px_-5px_rgba(6,182,212,0.3)] hover:border-cyan-500/30",
    };

    return (
      <div
        ref={ref}
        className={`glass-panel rounded-xl transition-all duration-200 overflow-hidden ${glowStyles[glow]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export function CardHeader({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-5 py-4 border-b border-white/[0.06] flex items-center justify-between ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-base font-semibold text-text-primary tracking-tight flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-xs text-text-secondary mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-5 py-3.5 bg-black/20 border-t border-white/[0.06] flex items-center justify-between ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
