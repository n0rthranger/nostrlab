import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "accent" | "electric" | "success" | "danger" | "muted";
  size?: "sm" | "md";
}

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default:  "bg-surface2 text-fg2 border border-border",
  accent:   "bg-accentSoft text-accentStrong border border-accent/20 dark:text-accent dark:bg-accent/15",
  electric: "bg-electricSoft text-electricStrong border border-electric/20 dark:text-electric dark:bg-electric/15",
  success:  "bg-successSoft text-success border border-success/20 dark:bg-success/15",
  danger:   "bg-dangerSoft text-danger border border-danger/20 dark:bg-danger/15",
  muted:    "bg-transparent text-muted border border-border",
};

const sizes: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "text-[11px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

export function Badge({ tone = "default", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap",
        tones[tone],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
