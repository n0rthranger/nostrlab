import { cn } from "@/lib/utils";

export function DateBlock({
  date,
  size = "md",
  className,
}: {
  date: Date | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate();

  const sizes = {
    sm: { box: "w-12 h-14", month: "text-[10px]", day: "text-lg" },
    md: { box: "w-14 h-16", month: "text-[11px]", day: "text-xl" },
    lg: { box: "w-16 h-20", month: "text-xs", day: "text-2xl" },
  };
  const s = sizes[size];

  return (
    <div className={cn(
      "shrink-0 rounded-xl bg-surface border border-border flex flex-col items-center justify-center overflow-hidden shadow-soft",
      s.box,
      className
    )}>
      <div className={cn("font-medium tracking-wider text-accent leading-none pt-1.5", s.month)}>
        {month}
      </div>
      <div className={cn("font-semibold tabular-nums leading-none mt-1 mb-1", s.day)}>
        {day}
      </div>
    </div>
  );
}
