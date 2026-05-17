"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

export function TicketRecoveryButton({ ticketId }: { ticketId: string }) {
  const { identity, signEvent } = useNostr();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function recover() {
    setMessage(null);
    if (!identity) { setMessage("Sign in again."); return; }
    const payload = { ticketId };
    setBusy(true);
    try {
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "ticket.recover"],
          ["t", ticketId],
          ["payload_hash", await hashAuthPayload(payload)],
        ],
      });
      const res = await fetch(`/api/tickets/${ticketId}/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedAuthEvent: signed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Recovery failed");
      const url = `${window.location.origin}${json.ticketUrl}`;
      await navigator.clipboard.writeText(url);
      setMessage("Ticket link copied");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="ghost" onClick={recover} disabled={busy}>
        {busy ? "Signing..." : "Copy ticket link"}
      </Button>
      {message && <span className="text-[11px] text-muted">{message}</span>}
    </div>
  );
}
