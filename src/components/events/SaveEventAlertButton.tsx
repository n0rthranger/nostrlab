"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNostr } from "@/hooks/useNostr";

const SAVED_KEYS = ["q", "city", "tag", "category", "mode", "paid", "lat", "lng", "radius"] as const;

export function SaveEventAlertButton() {
  const sp = useSearchParams();
  const { identity, login, hasSigner } = useNostr();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setMessage((e as Error).message); return; }
    }
    setBusy(true);
    try {
      const body: Record<string, string> = {};
      for (const key of SAVED_KEYS) {
        const value = sp.get(key);
        if (value) body[key] = value;
      }
      const res = await fetch("/api/event-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save alert");
      setMessage("Alert saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={save}
        disabled={busy || (!identity && !hasSigner)}
        className="h-10 px-3 text-sm font-medium rounded-full border border-border hover:bg-surface2 disabled:opacity-50 transition-colors"
      >
        {busy ? "Saving" : "Save alert"}
      </button>
      {message && (
        <span className="absolute right-0 top-[calc(100%+4px)] z-10 w-44 rounded-lg border border-border bg-surface px-2 py-1 text-right text-[11px] text-muted shadow-soft">
          {message}
        </span>
      )}
    </span>
  );
}
