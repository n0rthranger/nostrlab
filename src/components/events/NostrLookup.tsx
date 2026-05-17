"use client";

import { useState } from "react";

interface Props {
  nevent: string;
  naddr: string;
  nostrId: string;
}

// Small panel with cross-client links. njump.me is a generic Nostr resolver
// (it'll redirect to whichever client the user prefers). The other links go
// straight to specific clients in case the user wants to test rendering in
// a calendar-aware app.
export function NostrLookup({ nevent, naddr, nostrId }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-medium">Open elsewhere</div>
      <p className="text-xs text-muted leading-relaxed">
        Your event isn't locked to NostrLab. Open it in another app to share or view.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://njump.me/${naddr}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-fg text-bg text-xs font-medium hover:bg-fg2 transition-colors"
        >
          njump.me
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
        </a>
        <a
          href={`https://plektos.app/event/${nevent}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs font-medium hover:bg-surface2 transition-colors"
        >
          Plektos
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
        </a>
        <a
          href={`nostr:${naddr}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs font-medium hover:bg-surface2 transition-colors"
          title="Opens in Amethyst (Android) or your default Nostr app"
        >
          Amethyst
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
        </a>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-fg select-none">
          Copy raw identifiers
        </summary>
        <div className="mt-2 space-y-2">
          <CopyRow label="naddr" value={naddr} hint="Stable address, points to current version" copied={copied === "naddr"} onCopy={() => copy("naddr", naddr)} />
          <CopyRow label="nevent" value={nevent} hint="Immutable event id with relay hints" copied={copied === "nevent"} onCopy={() => copy("nevent", nevent)} />
          <CopyRow label="event id" value={nostrId} hint="Bare hex event id" copied={copied === "id"} onCopy={() => copy("id", nostrId)} />
        </div>
      </details>
    </div>
  );
}

function CopyRow({
  label, value, hint, copied, onCopy,
}: { label: string; value: string; hint: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] text-muted hover:text-fg transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="font-mono text-[10px] break-all bg-surface2 border border-border rounded-md p-2 leading-relaxed">
        {value}
      </div>
      <div className="text-[10px] text-muted mt-0.5">{hint}</div>
    </div>
  );
}
