import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "cyan";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-brand-purple rounded-lg";

    const variantStyles = {
      primary:
        "bg-gradient-to-r from-purple-600 via-indigo-600 to-brand-cyan text-white shadow-lg hover:shadow-brand-purple/25 hover:brightness-110 active:scale-[0.98]",
      secondary:
        "bg-background-surface hover:bg-background-surfaceHover text-text-primary border border-white/10 hover:border-white/20 active:scale-[0.98]",
      danger:
        "bg-rose-600/90 hover:bg-rose-600 text-white shadow-lg hover:shadow-rose-500/25 active:scale-[0.98]",
      ghost:
        "bg-transparent hover:bg-white/5 text-text-secondary hover:text-text-primary active:scale-[0.98]",
      outline:
        "bg-transparent border border-brand-purple/40 text-brand-purple hover:bg-brand-purple/10 active:scale-[0.98]",
      cyan:
        "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 active:scale-[0.98]",
    };

    const sizeStyles = {
      sm: "text-xs px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2 gap-2",
      lg: "text-base px-5 py-2.5 gap-2.5",
      icon: "p-2 w-9 h-9",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        {children}
        {!isLoading && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
