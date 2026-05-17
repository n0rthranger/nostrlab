"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// Refined button system — pill shapes for primary CTAs, rounded-md for chrome.
const variants: Record<Variant, string> = {
  primary:
    "bg-fg text-bg hover:bg-fg2 disabled:opacity-50 shadow-soft",
  secondary:
    "bg-surface text-fg border border-border hover:bg-surface2 hover:border-subtle disabled:opacity-50",
  ghost:
    "bg-transparent text-fg hover:bg-surface2 disabled:opacity-50",
  outline:
    "bg-transparent text-fg border border-border hover:bg-surface2 hover:border-fg/30 disabled:opacity-50",
  danger:
    "bg-danger text-white hover:bg-danger/90 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-[15px] rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium gap-2 transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out",
        "active:scale-[0.98] focus-ring",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";
