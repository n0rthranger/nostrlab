import { useState, useEffect } from "react";
import { pool, DEFAULT_RELAYS, repoAddress } from "../lib/nostr";
import { CI_STATUS } from "../types/nostr";
import type { CIStatusEvent } from "../types/nostr";

interface Props {
  repoPubkey: string;
  identifier: string;
}

const STATE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  success: { bg: "bg-green/15", text: "text-green", label: "passing" },
  failure: { bg: "bg-red/15", text: "text-red", label: "failing" },
  pending: { bg: "bg-orange/15", text: "text-orange", label: "pending" },
  error: { bg: "bg-red/15", text: "text-red", label: "error" },
};

export default function CIStatusBadge({ repoPubkey, identifier }: Props) {
  const [statuses, setStatuses] = useState<CIStatusEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const addr = repoAddress(repoPubkey, identifier);
    pool.querySync(DEFAULT_RELAYS, { kinds: [CI_STATUS], "#a": [addr], limit: 10 }).then((events) => {
      if (cancelled) return;
      // Keep latest per context
      const byContext = new Map<string, CIStatusEvent>();
      for (const e of events) {
        const ctx = e.tags.find((t) => t[0] === "context")?.[1] ?? "default";
        const existing = byContext.get(ctx);
        if (!existing || e.created_at > existing.createdAt) {
          byContext.set(ctx, {
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            targetId: e.tags.find((t) => t[0] === "e")?.[1] ?? "",
            repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
            state: (e.tags.find((t) => t[0] === "state")?.[1] as CIStatusEvent["state"]) ?? "pending",
            context: ctx,
            targetUrl: e.tags.find((t) => t[0] === "url")?.[1],
            createdAt: e.created_at,
          });
        }
      }
      setStatuses([...byContext.values()]);
    });
    return () => { cancelled = true; };
  }, [repoPubkey, identifier]);

  if (statuses.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {statuses.map((s) => {
        const style = STATE_STYLES[s.state] ?? STATE_STYLES.pending;
        const badge = (
          <span
            key={s.id}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}
            title={`${s.context}: ${s.state}${s.content ? ` — ${s.content}` : ""}`}
          >
            {s.state === "success" && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
            )}
            {s.state === "failure" && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
            )}
            {s.state === "pending" && (
              <div className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {s.context}: {style.label}
          </span>
        );
        let isSafeUrl = false;
        if (s.targetUrl) {
          try {
            const parsed = new URL(s.targetUrl);
            isSafeUrl = parsed.protocol === "https:" || parsed.protocol === "http:";
          } catch { /* invalid URL */ }
        }
        return isSafeUrl ? (
          <a key={s.id} href={s.targetUrl} target="_blank" rel="noopener noreferrer" className="no-underline hover:no-underline">
            {badge}
          </a>
        ) : badge;
      })}
    </div>
  );
}
