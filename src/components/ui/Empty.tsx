import type { ReactNode } from "react";

export function Empty({
  title, hint, action, icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-surface2 grid place-items-center mb-4 text-muted">
        {icon ?? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        )}
      </div>
      <h3 className="font-semibold text-base">{title}</h3>
      {hint && <p className="text-muted text-sm mt-1.5 max-w-sm mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
