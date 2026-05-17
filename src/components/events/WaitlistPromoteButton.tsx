"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

export function WaitlistPromoteButton({ eventId, pubkey }: { eventId: string; pubkey: string }) {
  const router = useRouter();
  const { identity, signEvent } = useNostr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function promote() {
    setErr(null);
    if (!identity) { setErr("Sign in again."); return; }
    const payload = { eventId, pubkey };
    setBusy(true);
    try {
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "waitlist.promote"],
          ["e", eventId],
          ["payload_hash", await hashAuthPayload(payload)],
        ],
      });
      const res = await fetch(`/api/events/${eventId}/waitlist/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedAuthEvent: signed, pubkey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Promotion failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={promote} disabled={busy}>
        {busy ? "Promoting..." : "Promote"}
      </Button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}
